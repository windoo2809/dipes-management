const { Controller } = require("../config/controllers");
const { Projects, ProjectsRecord } = require("../models/Projects");

const { intValidate } = require("../functions/validator");
const { Model } = require("../config/models");
const { CONDITION_TYPE } = require("../Constants");

const UPDATE_METHODS = {
  override: "override",
  calculate: "calculate",
  increase: "increase",
};

const OPERATORS = {
  sum: "sum",
  minus: "minus",
  divide: "divide",
  multiply: "multiply",
};

class APIController extends Controller {
  constructor() {
    super();
  }

  generalCheck = async (req, version_id = 0) => {
    const verified = await this.verifyToken(req);
    const context = {
      success: false,
      status: "0x4501216",
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
        context.success = true;
        context.content = "Thành công nhe mấy má";
        context.objects = {
          Project,
          user: decodedToken,
          version: Project.getData().versions[`${version_id}`],
        };
      } else {
        context.content = "Dự án khum tồn tại";
        context.status = "0x4501213";
      }
    }
    return context;
  };

  stringifyParams = (tables, params) => {
    const corespondingFields = [];

    params.map((field_id) => {
      for (let i = 0; i < tables.length; i++) {
        const fields = tables[i].fields;
        const field = fields[`${field_id}`];
        if (field != undefined) {
          corespondingFields.push(field);
        }
      }
    });
    return corespondingFields.map((field) => `:${field.field_name}`).join("/");
  };

  get = async (req, res) => {
    this.writeReq(req);
    const { version_id } = req.params;
    const context = await this.generalCheck(req, version_id);
    const { objects, success } = context;
    /* Logical code goes here */
    if (success) {
      const { Project, version } = objects;
      const project = Project.getData();
      const apis = Object.values(version.apis);
      const tables = Object.values(version.tables);

      const viewMode = req.header("view-mode");
      let allFields = {};

      tables.map((tb) => {
        allFields = { ...allFields, ...tb.fields };
      });

      apis.map((api) => {
        api.fields = Object.values(api.fields);
        api.fields.map((field) => {
          const field_id = field.id;
          if (tables && tables.length > 0) {
            for (let i = 0; i < tables.length; i++) {
              const table = tables[i];
              const fields = table.fields;
              if (fields != undefined && fields[`${field_id}`] != undefined) {
                field.fomular_alias = fields[`${field_id}`].fomular_alias;
              }
            }
          }
        });

        api.body_detail = api.body?.map((field_id) => {
          return allFields[`${field_id}`];
        });

        api.statistic = Object.values(api.statistic);
        api.calculates = Object.values(api.calculates);
        api.proxy_server = project.proxy_server;
        try {
          api.cai_gi_cung_dc_het_tron_a =
            api.proxy_server +
            api.url +
            "/" +
            this.stringifyParams(tables, api.params);
        } catch {
          console.log(api);
        }
      });

      if (viewMode == "public-only") {
        context.data = {
          apis: apis.filter((api) => api.api_scope == "public"),
        };
      } else {
        context.data = { apis: apis };
      }
    }

    delete context.objects;
    res.status(200).send(context);
  };

  makeAlias = async (req, res) => {
    this.writeReq(req);
    const { version_id, field_name } = req.body;
    const context = await this.generalCheck(req, version_id);

    const { success, objects } = context;
    if (success) {
      const { Project } = objects;
      const alias = await Project.makeAlias(field_name, "");
      context.alias = alias;
    }

    delete context.objects;
    res.status(200).send(context);
  };

  validTableRelation = (version, tableIds) => {
    let valid = true;
    for (let i = 0; i < tableIds.length; i++) {
      if (
        !intValidate(tableIds[i]) ||
        version.tables[`${tableIds[i]}`] == undefined
      ) {
        valid = false;
      }
    }

    if (valid) {
      const parsedIDs = tableIds.map((id) => parseInt(id));
      if (parsedIDs.length != 1) {
        const tables = Object.values(version.tables).map((table) => {
          table.foreign_keys = Object.values(table.foreign_keys);
          return table;
        });

        const areAllTablesHadPrimaryKey = tables.filter(
          (tb) => !tb.primary_key || !tb.primary_key.length
        );
        if (areAllTablesHadPrimaryKey.length == 0) {
          const all_foreign_keys = [];
          const all_primary_keys = [];

          const raw_primary_keys = tables.map((tb) => tb.primary_key);
          const raw_foreign_keys = tables.map((tb) => {
            return { keys: tb.foreign_keys, tbId: tb.id };
          });
          for (let i = 0; i < raw_primary_keys.length; i++) {
            all_primary_keys.push(...raw_primary_keys[i]);
          }

          for (let i = 0; i < raw_foreign_keys.length; i++) {
            const { keys, tbId } = raw_foreign_keys[i];
            if (keys) {
              for (let j = 0; j < keys.length; j++) {
                all_foreign_keys.push({ thisTb: tbId, ...keys[j] });
              }
            }
          }
          let areTheyAllConnected = true;
          for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const { primary_key, foreign_keys } = table;
            let isASlave = false;
            let isAMaster = false;
            if (foreign_keys) {
              for (let i = 0; i < foreign_keys.length; i++) {
                const foreign_key = foreign_keys[i];
                const master = all_primary_keys.filter(
                  (key) => foreign_key.ref_field_id == key
                )[0];
                if (master) {
                  isASlave = true;
                }
              }
            }

            if (primary_key) {
              for (let i = 0; i < primary_key.length; i++) {
                const pkey = primary_key[i];
                const slave = all_foreign_keys.filter(
                  (key) => key.ref_field_id == pkey
                )[0];
                if (slave) {
                  isAMaster = true;
                }
              }
            }
            if (!isAMaster && !isASlave) {
              areTheyAllConnected = false;
            }
          }
          if (areTheyAllConnected) {
            return { valid: true, parsedTableIds: parsedIDs };
          } else {
            return {
              valid: false,
              status: "0x4501217",
              error:
                "Tồn tại ít nhất một table khum có liên kết khóa với phần còn lại",
            };
          }
        } else {
          return {
            valid: false,
            status: "0x4501218",
            error: "Tồn tại ít nhất một table khum có khóa chính",
          };
        }
      } else {
        return { valid: true, parsedTableIds: parsedIDs };
      }
    } else {
      return {
        valid: false,
        status: "0x4501219",
        error: "Tồn tại ít nhất một table id khum hợp lệ",
      };
    }
  };

  versionHasField = (version, field_id) => {
    const tables = Object.values(version.tables);
    let exists = undefined;

    if (tables && tables.length > 0) {
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const fields = table.fields;
        if (fields != undefined && fields[`${field_id}`] != undefined) {
          exists = fields[`${field_id}`];
        }
      }
    }
    return exists;
  };

  getFieldsByProject = (Project) => {
    const fields = [];
    for (const k in Project.getData().versions) {
      for (const i in Project.getData().versions[k]["tables"]) {
        for (const j in Project.getData().versions[k]["tables"][i]["fields"]) {
          const field = Project.getData().versions[k]["tables"][i]["fields"][j];
          fields.push({
            id: field.id,
            fomular_alias: field.fomular_alias,
            props: field.props,
          });
        }
      }
    }
    return fields;
  };

  isNumberType = (value) => {
    let isNumberType = false;
    switch (value) {
      case "INT":
      case "INT UNSIGNED":
      case "BIGINT":
      case "BIGINT UNSIGNED":
      case "DECIMAL":
      case "DECIMAL UNSIGNED":
        isNumberType = true;
        break;
    }
    return isNumberType;
  };

  createApi = async (req, res) => {
    this.writeReq(req);
    const { version_id, api } = req.body;
    const context = await this.generalCheck(req, version_id);
    const { success, objects } = context;

    if (success) {
      const { Project, version, user } = objects;
      const fields = this.getFieldsByProject(Project);

      const getFieldById = (id) => {
        return fields.find((field) => field.id === id);
      };

      const areAllTableValidAndConnected = this.validTableRelation(
        version,
        api.tables
      );

      if (areAllTableValidAndConnected) {
        const { fields, body, params } = api;

        const fieldIds = [];
        if (fields != undefined) {
          fieldIds.push(...fields.map((field) => field.id));
        }
        if (body.length) {
          api.body = body.map(({ fieldId }) => fieldId);

          fieldIds.push(...api.body.map((fieldId) => fieldId));
        }
        if (params) {
          fieldIds.push(...params.map((fieldId) => fieldId));
        }

        let valid = true;
        for (let i = 0; i < fieldIds.length; i++) {
          const fieldExist = this.versionHasField(version, fieldIds[i]);

          if (!fieldExist) {
            valid = false;
          }
        }

        if (valid) {
          const serializedApi = await Project.createAPI(api, user);

          const { body_update_method } = api;
          if (
            body_update_method != undefined &&
            Array.isArray(body_update_method)
          ) {
            const not_include_fields = body.filter(
              ({ fieldId, method_type }) =>
                !body_update_method.find((f) => f.field_id == fieldId)
            );

            if (not_include_fields.length > 0) {
              for (let i = 0; i < not_include_fields.length; i++) {
                const field = getFieldById(not_include_fields[i].fieldId);
                const update_method = {
                  field_id: not_include_fields[i].fieldId,
                  conditions: [
                    {
                      tableId: 9328,
                      fieldId: 9329,
                      condition_type: CONDITION_TYPE.NOT_NULL,
                      key: "5MVR",
                      failed_value: "",
                      success_valued: "",
                      condition_column: [
                        {
                          condition_type: "NOT_NULL",
                          key: "13SP",
                          comparison_value: {
                            field_alias: "10SP",
                            table_alias: "3XK",
                          },
                        },
                        {
                          condition_type: "NOT_NULL",
                          key: "13SP",
                          comparison_value: {
                            field_alias: "10SP",
                            table_alias: "3XK",
                          },
                        },
                        {
                          condition_type: "NOT_NULL",
                          key: "13SP",
                          comparison_value: {
                            field_alias: "10SP",
                            table_alias: "3XK",
                          },
                        },
                      ],
                    },
                  ],
                  method:
                    field && this.isNumberType(field.props.DATATYPE)
                      ? UPDATE_METHODS[not_include_fields[i].method_type]
                      : "override",
                };
                body_update_method.push(update_method);
              }
            }

            serializedApi.body_update_method = body_update_method;
          } else {
            const formated_update_methods = body.map(
              ({ fieldId, method_type, conditions }) => {
                const field = getFieldById(fieldId);

                return {
                  field_id: fieldId,
                  conditions,
                  // conditions: [
                  //   {
                  //     tableId: 9328,
                  //     fieldId: 9329,
                  //     condition_type: CONDITION_TYPE.NOT_NULL,
                  //     key: "5MVR",
                  //     failed_value: "",
                  //     success_valued: "",
                  //     condition_column: [
                  //       {
                  //         condition_type: "NOT_NULL",

                  //         key: "13SP",
                  //         comparison_value: {
                  //           field_alias: "10SP",
                  //           table_alias: "3XK",
                  //         },
                  //       },
                  //     ],
                  //   },
                  //   {
                  //     tableId: 9328,
                  //     fieldId: 9329,
                  //     condition_type: CONDITION_TYPE.NOT_NULL,
                  //     key: "5MVR",
                  //     failed_value: "",
                  //     success_valued: "",
                  //     condition_column: [
                  //       {
                  //         condition_type: "NOT_NULL",

                  //         key: "13SP",
                  //         comparison_value: {
                  //           field_alias: "10SP",
                  //           table_alias: "3XK",
                  //         },
                  //       },
                  //     ],
                  //   },
                  //   {
                  //     tableId: 9328,
                  //     fieldId: 9329,
                  //     condition_type: CONDITION_TYPE.NOT_NULL,
                  //     key: "5MVR",
                  //     failed_value: "",
                  //     success_valued: "",
                  //     condition_column: [
                  //       {
                  //         condition_type: "NOT_NULL",

                  //         key: "13SP",
                  //         comparison_value: {
                  //           field_alias: "10SP",
                  //           table_alias: "3XK",
                  //         },
                  //       },
                  //     ],
                  //   },
                  // ],
                  method:
                    field && this.isNumberType(field.props.DATATYPE)
                      ? UPDATE_METHODS[method_type]
                      : "override",
                };
              }
            );
            serializedApi.body_update_method = formated_update_methods;
          }

          const apis = version.apis;
          apis[`${serializedApi.id}`] = serializedApi;

          version.apis = apis;

          const project = Project.getData();
          project.versions[`${version.version_id}`] = version;
          Project.setData(project);
          Project.save();

          context.api = serializedApi;
          context.status = "0x4501223";

          this.saveLog(
            "info",
            req.ip,
            `__createAPI`,
            `__projectname: ${project.project_name}| __versionname: ${
              version.version_name
            }| __apiname: ${api.api_name} | __apiurl: ${
              api.url
            } | ${api.api_method.toUpperCase()} | ${api.api_scope}`,
            user.username
          );
        } else {
          context.content =
            "Danh sách trường tồn tại một trường không hợp lệ hoặc đã bị xóa";
          context.status = "0x";
        }
      } else {
        context.content = "Các bảng khum hợp lệ hoặc khum có liên kết khóa";
        context.status = areAllTableValidAndConnected.status;
        context.success = false;
      }
    }

    delete context.objects;
    res.status(200).send(context);
  };

  update = async (req, res) => {
    this.writeReq(req);
    const { version_id, api } = req.body;
    const context = await this.generalCheck(req, version_id);

    const { success, objects } = context;

    if (success) {
      const { Project, version, user } = objects;

      const fields = this.getFieldsByProject(Project);

      const getFieldById = (id) => {
        return fields.find((field) => field.id === id);
      };

      const areAllTableValidAndConnected = this.validTableRelation(
        version,
        api.tables
      );

      if (areAllTableValidAndConnected) {
        const { fields, body, params } = api;
        const fieldIds = [];
        if (fields != undefined) {
          fieldIds.push(...fields.map((field) => field.id));
        }
        if (body) {
          fieldIds.push(...body.map((fieldId) => fieldId));
        }
        if (params) {
          fieldIds.push(...params);
        }

        let valid = true;
        for (let i = 0; i < fieldIds.length; i++) {
          const fieldExist = this.versionHasField(version, fieldIds[i]);

          if (!fieldExist) {
            valid = false;
          }
        }

        if (valid) {
          const apis = version.apis;
          apis[`${api.id}`] = api;

          const { body_update_method } = api;

          if (
            body_update_method != undefined &&
            Array.isArray(body_update_method)
          ) {
            const not_include_fields = body.filter(
              (fieldId) =>
                !body_update_method.find((f) => f.field_id == fieldId)
            );

            if (not_include_fields.length > 0) {
              for (let i = 0; i < not_include_fields.length; i++) {
                const field = getFieldById(not_include_fields[i].fieldId);
                const update_method = {
                  field_id: not_include_fields[i].fieldId,
                  method:
                    field && this.isNumberType(field.props.DATATYPE)
                      ? UPDATE_METHODS[method_type]
                      : "override",
                };
                body_update_method.push(update_method);
              }
            }
          } else {
            const formated_update_methods = body.map((field) => {
              const fieldObject = getFieldById(field);
              return {
                field_id: field,
                method:
                  fieldObject && this.isNumberType(fieldObject.props.DATATYPE)
                    ? UPDATE_METHODS[method_type]
                    : "override",
              };
            });
            api.body_update_method = formated_update_methods;
          }

          /**
           * Validate method type
           */
          for (let i = 0; i < api.body_update_method.length; i++) {
            const { field_id, method } = api.body_update_method[i];
            const field = getFieldById(field_id);
            if (this.isNumberType(field.props.DATATYPE) === false) {
              api.body_update_method[i].method = "override";
            }
          }

          /** End Validate method type */

          version.apis = apis;
          const project = Project.getData();
          project.versions[`${version.version_id}`] = version;
          Project.setData(project);
          const newProject = Project.getData();
          Project.__modifyAndSaveChange__(
            `versions.${version.version_id}`,
            newProject.versions[`${version.version_id}`]
          );

          context.api = api;
          context.status = "0x4501224";

          this.saveLog(
            "info",
            req.ip,
            `__updateAPI`,
            `__projectname: ${project.project_name}| __versionname: ${
              version.version_name
            }| __apiname: ${api.api_name} | __apiurl: ${
              api.url
            } | ${api.api_method.toUpperCase()} | ${api.api_scope}`,
            user.username
          );
        } else {
          context.content =
            "Danh sách trường tồn tại một trường không hợp lệ hoặc đã bị xóa";
          context.status = "0x4501221";
        }
      } else {
        context.content = "Các bảng khum hợp lệ hoặc khum có liên kết khóa";
        context.status = areAllTableValidAndConnected.status;
      }
    }

    delete context.objects;
    res.status(200).send(context);
  };

  delete = async (req, res) => {
    this.writeReq(req);
    const { version_id, api_id } = req.body;
    const context = await this.generalCheck(req, version_id);

    const { success, objects } = context;

    if (success) {
      const { Project, version, user } = objects;
      const project = Project.getData();

      const apis = Object.values(version.apis);
      const targetApi = apis.find((api) => api.api_id == api_id);

      if (targetApi) {
        delete version.apis[`${targetApi.id}`];
        Project.__modifyAndSaveChange__(
          `versions.${version.version_id}`,
          version
        );
        this.saveLog(
          "info",
          req.ip,
          "__removeApi",
          `__projectname: ${project.project_name} | __versionname ${version.version_name} | __apiname: ${targetApi.api_name}`,
          user.username
        );
      }
    }

    context.status = "0x4501225";
    delete context.objects;
    res.status(200).send(context);
  };
}
module.exports = APIController;
