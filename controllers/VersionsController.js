const fs = require("fs");
const archiver = require("archiver");
const encryptedArchiver = require("archiver-zip-encryptable");
const Crypto = require("./Crypto");
const { Controller } = require("../config/controllers");
const { Projects, ProjectsRecord } = require("../models/Projects");

const { formatDecNum } = require("../functions/auto_value");
const { Database } = require("../config/models/database");

archiver.registerFormat("zip-encryptable", encryptedArchiver);

class VersionsController extends Controller {
  #__archivePassword = "Dipes@2024";
  constructor() {
    super();
  }

  get = async (req, res) => {
    this.writeReq(req);

    /* Logical code goes here */

    this.writeRes({ status: 200, message: "Sample response" });
    res.status(200).send({
      success: true,
      content: "Sample response",
      data: [],
    });
  };

  generalCheck = async (req, version_id = 0) => {
    const verified = true;
    // const verified = await this.verifyToken(req)
    const context = {
      success: false,
      status: "0x450002",
      content: "Token khum hợp lệ",
    };

    if (verified) {
      const decodedToken = this.decodeToken(req.header("Authorization"));
      const ProjectsModel = new Projects();
      const query = {};
      query[`versions.${version_id}`] = { $ne: undefined };
      const project = await ProjectsModel.find(query, false);

      if (project) {
        const Project = new ProjectsRecord(project);
        const list = project.versions[version_id].ui.pages;

        /** THE FUCKING CODE */
        for (const k in Project.getData().versions[`${version_id}`].apis) {
          let field;

          list.find(({ component = [] }) => {
            field = component?.find(
              ({ props: { api = {} } }) =>
                Project.getData().versions[`${version_id}`].apis[k].id ===
                api.id
            )?.props.api.field;
            return field;
          });

          if (field) {
            Project.getData().versions[`${version_id}`].apis[k].field = field;
          }
        }
        /** */

        context.success = true;
        context.content = "Thành công nhe mấy má";
        context.objects = {
          Project,
          user: decodedToken,
          version: Project.getData().versions[`${version_id}`],
        };
      } else {
        context.content = "Dự án khum tồn tại";
        context.status = "0x450003";
      }
    }
    return context;
  };

  generalCheckWithoutToken = async (req, version_id = 0) => {
    const verified = true;
    const context = {
      success: false,
      status: "0x450002",
      content: "Token khum hợp lệ",
    };
    if (verified) {
      const ProjectsModel = new Projects();
      const query = {};
      query[`versions.${version_id}`] = { $ne: undefined };
      const project = await ProjectsModel.find(query, false);
      if (project) {
        const Project = new ProjectsRecord(project);
        context.success = true;
        context.content = "Thành công nhe mấy má";
        context.objects = {
          Project,
          version: Project.getData().versions[`${version_id}`],
        };
      } else {
        context.content = "Dự án khum tồn tại";
        context.status = "0x450003";
      }
    }
    return context;
  };

  writeUIForExportingWholeProject = async (req, res) => {
    const { version_id } = req.params;
    const context = await this.generalCheck(req, version_id);
    const { success, objects } = context;

    if (success) {
      const { Project, version, user } = objects;

      const uis = Object.values(version.uis);
      if (uis && uis.length > 0) {
        const PATH = "public/build/client/dipe-configs/ui.json";

        const uiFileExisted = fs.existsSync(PATH);
        if (uiFileExisted) {
          fs.unlinkSync(PATH);
        }

        uis.map((ui) => {
          const components = Object.values(ui.components);

          components.map((cpm) => {
            cpm.component_name = ui.title;
          });

          ui.components = components;
        });
        fs.writeFileSync(PATH, JSON.stringify({ data: uis }));
      } else {
        context.success = false;
        context.content = "Khum tìm thấy UI";
      }
    }
    delete context.objects;
    res.status(200).send(context);
  };

  exportWholeProject = async (req, res) => {
    const { version_id } = req.params;
    const context = await this.generalCheckWithoutToken(req, version_id);
    const { success, objects } = context;
    if (success) {
      const { Project, version, user } = objects;
      const project = Project.getData();
      const date = new Date();
      const sourceFolderPath = "public\\build";
      const outputFilePath = `public\\${
        date.getFullYear() - 2000
      }-${formatDecNum(date.getMonth() + 1)}-${formatDecNum(
        date.getDate()
      )} ${formatDecNum(date.getHours())}:${formatDecNum(date.getMinutes())}_${
        project.project_name
      }_${version.version_name}.zip`;

      const output = fs.createWriteStream(outputFilePath);
      const archive = archiver("zip-encryptable", {
        zlib: { level: 9 },
        password: this.#__archivePassword,
      });

      archive.directory(sourceFolderPath, false);
      archive.pipe(output);
      archive.finalize();

      output.on("close", () => {
        res.download(outputFilePath);
      });
    } else {
      res.status(200).send(context);
    }
  };

  exportTables = async (req, res) => {
    const { version_id } = req.params;
    const context = await this.generalCheck(req, version_id);
    const { success, objects } = context;

    if (success) {
      const { Project, version, user } = objects;
      const project = Project.getData();
      const tables = Object.values(version.tables);
      const fields = [];

      const preimports = {};

      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const tableFields = Object.values(table.fields);
        table.foreign_keys = Object.values(table.foreign_keys);
        if (tableFields) {
          const formatedFields = tableFields.map((field) => {
            field.table_id = table.id;
            return { ...field, ...field.props, props: {} };
          });
          fields.push(...formatedFields);
          delete table.fields;
        }

        const { pre_import, table_alias } = table;
        if (pre_import) {
          const data = await Database.selectAllWithProjection(
            table_alias,
            {},
            { _id: 0, id: 0 }
          );
          preimports[table_alias] = {
            table_alias,
            data,
          };
        }
      }
      const Cipher = new Crypto();

      const primalData = {
        database: {
          project: Project.getGeneralData(),
          tables,
          fields,
          preimports,
        },
      };
      const stringifiedData = JSON.stringify(primalData);

      context.data = { rawData: primalData };
      context.data.database = { database: Cipher.encrypt(stringifiedData) };
    }
    delete context.objects;
    res.status(200).send(context);
  };

  exportAPIs = async (req, res) => {
    const { version_id } = req.params;
    const context = await this.generalCheck(req, version_id);
    const { success, objects } = context;

    if (success) {
      const { version, Project } = objects;
      const apis = Object.values(version.apis);

      apis.map((api) => {
        api.fields = Object.values(api.fields);
        api.statistic = Object.values(api.statistic);
        api.calculates = Object.values(api.calculates);
        api.group_by = api.group_by ? Object.values(api.group_by) : [];
      });

      const statis = apis.filter(
        (a) => a.api_id == "2C31BCECBB4C4DE680B26DB8A0C8D735"
      );
      console.log(statis);

      const Cipher = new Crypto();
      const primalData = { apis };

      const stringifiedData = JSON.stringify(primalData);
      context.data = {};

      context.data.apis = Cipher.encrypt(stringifiedData);
    }
    delete context.objects;
    res.status(200).send(context);
  };

  exportUIs = async (req, res) => {
    const { version_id } = req.params;
    const context = await this.generalCheck(req, version_id);
    const { success, objects } = context;

    if (success) {
      const { version, Project } = objects;

      const uis = Object.values(version.uis);
      if (uis && uis.length > 0) {
        uis.map((ui) => {
          const components = Object.values(ui.components);

          components.map((cpm) => {
            cpm.component_name = ui.title;
          });

          ui.components = components;
        });
        context.data = { uis };
      } else {
        context.success = false;
        context.content = "Khum tìm thấy UI";
      }
    }
    delete context.objects;
    res.status(200).send(context);
  };
}
module.exports = VersionsController;
