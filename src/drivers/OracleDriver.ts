import { AbstractDriver } from "./AbstractDriver";
import { ColumnInfo } from "./../models/ColumnInfo";
import { EntityInfo } from "./../models/EntityInfo";
import { RelationInfo } from "./../models/RelationInfo";
import { DatabaseModel } from "./../models/DatabaseModel";
import { promisify } from "util";
import { request } from "https";
import * as TomgUtils from "./../Utils";

/**
 * OracleDriver
 */
export class OracleDriver extends AbstractDriver {
    Oracle: any;
    constructor() {
        super();
        try {
            this.Oracle = require("oracledb");
        } catch (error) {
            TomgUtils.LogError("", false, error);
            throw error;
        }
    }

    async GetAllTables(schema: string): Promise<EntityInfo[]> {
        let response: { TABLE_NAME: string }[] = (await this.Connection.execute(
            ` SELECT TABLE_NAME FROM all_tables WHERE  owner = (select user from dual)`
        )).rows!;
        let ret: EntityInfo[] = <EntityInfo[]>[];
        response.forEach(val => {
            let ent: EntityInfo = new EntityInfo();
            ent.EntityName = val.TABLE_NAME;
            ent.Columns = <ColumnInfo[]>[];
            ent.Indexes = <IndexInfo[]>[];
            ret.push(ent);
        });
        return ret;
    }
    async GetCoulmnsFromEntity(
        entities: EntityInfo[],
        schema: string
    ): Promise<EntityInfo[]> {
        let response: {
            TABLE_NAME: string;
            COLUMN_NAME: string;
            DATA_DEFAULT: string;
            NULLABLE: string;
            DATA_TYPE: string;
            DATA_LENGTH: number;
            DATA_PRECISION: number;
            DATA_SCALE: number;
            IDENTITY_COLUMN: string;
            IS_UNIQUE: Number;
        }[] = (await this.Connection
            .execute(`SELECT utc.TABLE_NAME, utc.COLUMN_NAME, DATA_DEFAULT, NULLABLE, DATA_TYPE, DATA_LENGTH,
            DATA_PRECISION, DATA_SCALE, IDENTITY_COLUMN,
            (select count(*) from USER_CONS_COLUMNS ucc
             JOIN USER_CONSTRAINTS uc ON  uc.CONSTRAINT_NAME = ucc.CONSTRAINT_NAME and uc.CONSTRAINT_TYPE='U'
            where ucc.column_name = utc.COLUMN_NAME AND ucc.table_name = utc.TABLE_NAME) IS_UNIQUE
           FROM USER_TAB_COLUMNS utc`)).rows!;

        entities.forEach(ent => {
            response
                .filter(filterVal => {
                    return filterVal.TABLE_NAME == ent.EntityName;
                })
                .forEach(resp => {
                    let colInfo: ColumnInfo = new ColumnInfo();
                    colInfo.name = resp.COLUMN_NAME;
                    colInfo.is_nullable = resp.NULLABLE == "Y" ? true : false;
                    colInfo.is_generated =
                        resp.IDENTITY_COLUMN == "YES" ? true : false;
                    colInfo.default =
                        !resp.DATA_DEFAULT || resp.DATA_DEFAULT.includes('"')
                            ? null
                            : resp.DATA_DEFAULT;
                    colInfo.is_unique = resp.IS_UNIQUE > 0;
                    resp.DATA_TYPE = resp.DATA_TYPE.replace(/\([0-9]+\)/g, "");
                    colInfo.sql_type = resp.DATA_TYPE.toLowerCase();
                    switch (resp.DATA_TYPE.toLowerCase()) {
                        case "char":
                            colInfo.ts_type = "string";
                            break;
                        case "nchar":
                            colInfo.ts_type = "string";
                            break;
                        case "nvarchar2":
                            colInfo.ts_type = "string";
                            break;
                        case "varchar2":
                            colInfo.ts_type = "string";
                            break;
                        case "long":
                            colInfo.ts_type = "string";
                            break;
                        case "raw":
                            colInfo.ts_type = "Buffer";
                            break;
                        case "long raw":
                            colInfo.ts_type = "Buffer";
                            break;
                        case "number":
                            colInfo.ts_type = "number";
                            break;
                        case "numeric":
                            colInfo.ts_type = "number";
                            break;
                        case "float":
                            colInfo.ts_type = "number";
                            break;
                        case "dec":
                            colInfo.ts_type = "number";
                            break;
                        case "decimal":
                            colInfo.ts_type = "number";
                            break;
                        case "integer":
                            colInfo.ts_type = "number";
                            break;
                        case "int":
                            colInfo.ts_type = "number";
                            break;
                        case "smallint":
                            colInfo.ts_type = "number";
                            break;
                        case "real":
                            colInfo.ts_type = "number";
                            break;
                        case "double precision":
                            colInfo.ts_type = "number";
                            break;
                        case "date":
                            colInfo.ts_type = "Date";
                            break;
                        case "timestamp":
                            colInfo.ts_type = "Date";
                            break;
                        case "timestamp with time zone":
                            colInfo.ts_type = "Date";
                            break;
                        case "timestamp with local time zone":
                            colInfo.ts_type = "Date";
                            break;
                        case "interval year to month":
                            colInfo.ts_type = "string";
                            break;
                        case "interval day to second":
                            colInfo.ts_type = "string";
                            break;
                        case "bfile":
                            colInfo.ts_type = "Buffer";
                            break;
                        case "blob":
                            colInfo.ts_type = "Buffer";
                            break;
                        case "clob":
                            colInfo.ts_type = "string";
                            break;
                        case "nclob":
                            colInfo.ts_type = "string";
                            break;
                        case "rowid":
                            colInfo.ts_type = "number";
                            break;
                        case "urowid":
                            colInfo.ts_type = "number";
                            break;
                        default:
                            TomgUtils.LogError(
                                "Unknown column type:" + resp.DATA_TYPE
                            );
                            break;
                    }
                    if (
                        this.ColumnTypesWithPrecision.some(
                            v => v == colInfo.sql_type
                        )
                    ) {
                        colInfo.numericPrecision = resp.DATA_PRECISION;
                        colInfo.numericScale = resp.DATA_SCALE;
                    }
                    if (
                        this.ColumnTypesWithLength.some(
                            v => v == colInfo.sql_type
                        )
                    ) {
                        colInfo.lenght =
                            resp.DATA_LENGTH > 0 ? resp.DATA_LENGTH : null;
                    }

                    if (colInfo.sql_type) ent.Columns.push(colInfo);
                });
        });
        return entities;
    }
    async GetIndexesFromEntity(
        entities: EntityInfo[],
        schema: string
    ): Promise<EntityInfo[]> {
        let response: {
            COLUMN_NAME: string;
            TABLE_NAME: string;
            INDEX_NAME: string;
            UNIQUENESS: string;
            ISPRIMARYKEY: number;
        }[] = (await this.Connection
            .execute(`SELECT ind.TABLE_NAME, ind.INDEX_NAME, col.COLUMN_NAME,ind.UNIQUENESS, CASE WHEN uc.CONSTRAINT_NAME IS NULL THEN 0 ELSE 1 END ISPRIMARYKEY
        FROM USER_INDEXES ind
        JOIN USER_IND_COLUMNS col ON ind.INDEX_NAME=col.INDEX_NAME
        LEFT JOIN USER_CONSTRAINTS uc ON  uc.INDEX_NAME = ind.INDEX_NAME
        ORDER BY col.INDEX_NAME ASC ,col.COLUMN_POSITION ASC`)).rows!;

        entities.forEach(ent => {
            response
                .filter(filterVal => {
                    return filterVal.TABLE_NAME == ent.EntityName;
                })
                .forEach(resp => {
                    let indexInfo: IndexInfo = <IndexInfo>{};
                    let indexColumnInfo: IndexColumnInfo = <IndexColumnInfo>{};
                    if (
                        ent.Indexes.filter(filterVal => {
                            return filterVal.name == resp.INDEX_NAME;
                        }).length > 0
                    ) {
                        indexInfo = ent.Indexes.filter(filterVal => {
                            return filterVal.name == resp.INDEX_NAME;
                        })[0];
                    } else {
                        indexInfo.columns = <IndexColumnInfo[]>[];
                        indexInfo.name = resp.INDEX_NAME;
                        indexInfo.isUnique = resp.UNIQUENESS == "UNIQUE";
                        indexInfo.isPrimaryKey = resp.ISPRIMARYKEY == 1;
                        ent.Indexes.push(indexInfo);
                    }
                    indexColumnInfo.name = resp.COLUMN_NAME;
                    indexInfo.columns.push(indexColumnInfo);
                });
        });

        return entities;
    }
    async GetRelations(
        entities: EntityInfo[],
        schema: string
    ): Promise<EntityInfo[]> {
        let response: {
            OWNER_TABLE_NAME: string;
            OWNER_POSITION: string;
            OWNER_COLUMN_NAME: string;
            CHILD_TABLE_NAME: string;
            CHILD_COLUMN_NAME: string;
            DELETE_RULE: "RESTRICT" | "CASCADE" | "SET NULL" | "NO ACTION";
            CONSTRAINT_NAME: string;
        }[] = (await this.Connection
            .execute(`select owner.TABLE_NAME OWNER_TABLE_NAME,ownCol.POSITION OWNER_POSITION,ownCol.COLUMN_NAME OWNER_COLUMN_NAME,
        child.TABLE_NAME CHILD_TABLE_NAME ,childCol.COLUMN_NAME CHILD_COLUMN_NAME,
        owner.DELETE_RULE,
        owner.CONSTRAINT_NAME
        from user_constraints owner
        join user_constraints child on owner.r_constraint_name=child.CONSTRAINT_NAME and child.constraint_type in ('P','U')
        JOIN USER_CONS_COLUMNS ownCol ON owner.CONSTRAINT_NAME = ownCol.CONSTRAINT_NAME
        JOIN USER_CONS_COLUMNS childCol ON child.CONSTRAINT_NAME = childCol.CONSTRAINT_NAME AND ownCol.POSITION=childCol.POSITION
        ORDER BY OWNER_TABLE_NAME ASC, owner.CONSTRAINT_NAME ASC, OWNER_POSITION ASC`))
            .rows!;

        let relationsTemp: RelationTempInfo[] = <RelationTempInfo[]>[];
        response.forEach(resp => {
            let rels = relationsTemp.find(val => {
                return val.object_id == resp.CONSTRAINT_NAME;
            });
            if (rels == undefined) {
                rels = <RelationTempInfo>{};
                rels.ownerColumnsNames = [];
                rels.referencedColumnsNames = [];
                rels.actionOnDelete = resp.DELETE_RULE;
                rels.actionOnUpdate = "NO ACTION";
                rels.object_id = resp.CONSTRAINT_NAME;
                rels.ownerTable = resp.OWNER_TABLE_NAME;
                rels.referencedTable = resp.CHILD_TABLE_NAME;
                relationsTemp.push(rels);
            }
            rels.ownerColumnsNames.push(resp.OWNER_COLUMN_NAME);
            rels.referencedColumnsNames.push(resp.CHILD_COLUMN_NAME);
        });
        relationsTemp.forEach(relationTmp => {
            let ownerEntity = entities.find(entitity => {
                return entitity.EntityName == relationTmp.ownerTable;
            });
            if (!ownerEntity) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable} and ${
                        relationTmp.referencedTable
                    } didn't found entity model ${relationTmp.ownerTable}.`
                );
                return;
            }
            let referencedEntity = entities.find(entitity => {
                return entitity.EntityName == relationTmp.referencedTable;
            });
            if (!referencedEntity) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable} and ${
                        relationTmp.referencedTable
                    } didn't found entity model ${relationTmp.referencedTable}.`
                );
                return;
            }
            let ownerColumn = ownerEntity.Columns.find(column => {
                return column.name == relationTmp.ownerColumnsNames[0];
            });
            if (!ownerColumn) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable} and ${
                        relationTmp.referencedTable
                    } didn't found entity column ${
                        relationTmp.ownerTable
                    }.${ownerColumn}.`
                );
                return;
            }
            let relatedColumn = referencedEntity.Columns.find(column => {
                return column.name == relationTmp.referencedColumnsNames[0];
            });
            if (!relatedColumn) {
                TomgUtils.LogError(
                    `Relation between tables ${relationTmp.ownerTable} and ${
                        relationTmp.referencedTable
                    } didn't found entity column ${
                        relationTmp.referencedTable
                    }.${relatedColumn}.`
                );
                return;
            }
            let ownColumn: ColumnInfo = ownerColumn;
            let isOneToMany: boolean;
            isOneToMany = false;
            let index = ownerEntity.Indexes.find(index => {
                return (
                    index.isUnique &&
                    index.columns.some(col => {
                        return col.name == ownerColumn!.name;
                    })
                );
            });
            if (!index) {
                isOneToMany = true;
            } else {
                isOneToMany = false;
            }
            let ownerRelation = new RelationInfo();
            let columnName =
                ownerEntity.EntityName.toLowerCase() + (isOneToMany ? "s" : "");
            if (
                referencedEntity.Columns.filter(filterVal => {
                    return filterVal.name == columnName;
                }).length > 0
            ) {
                for (let i = 2; i <= ownerEntity.Columns.length; i++) {
                    columnName =
                        ownerEntity.EntityName.toLowerCase() +
                        (isOneToMany ? "s" : "") +
                        i.toString();
                    if (
                        referencedEntity.Columns.filter(filterVal => {
                            return filterVal.name == columnName;
                        }).length == 0
                    )
                        break;
                }
            }
            ownerRelation.actionOnDelete = relationTmp.actionOnDelete;
            ownerRelation.actionOnUpdate = relationTmp.actionOnUpdate;
            ownerRelation.isOwner = true;
            ownerRelation.relatedColumn = relatedColumn.name.toLowerCase();
            ownerRelation.relatedTable = relationTmp.referencedTable;
            ownerRelation.ownerTable = relationTmp.ownerTable;
            ownerRelation.ownerColumn = columnName;
            ownerRelation.relationType = isOneToMany ? "ManyToOne" : "OneToOne";
            ownerColumn.relations.push(ownerRelation);
            if (isOneToMany) {
                let col = new ColumnInfo();
                col.name = columnName;
                let referencedRelation = new RelationInfo();
                col.relations.push(referencedRelation);
                referencedRelation.actionOnDelete = relationTmp.actionOnDelete;
                referencedRelation.actionOnUpdate = relationTmp.actionOnUpdate;
                referencedRelation.isOwner = false;
                referencedRelation.relatedColumn = ownerColumn.name;
                referencedRelation.relatedTable = relationTmp.ownerTable;
                referencedRelation.ownerTable = relationTmp.referencedTable;
                referencedRelation.ownerColumn = relatedColumn.name.toLowerCase();
                referencedRelation.relationType = "OneToMany";
                referencedEntity.Columns.push(col);
            } else {
                let col = new ColumnInfo();
                col.name = columnName;
                let referencedRelation = new RelationInfo();
                col.relations.push(referencedRelation);
                referencedRelation.actionOnDelete = relationTmp.actionOnDelete;
                referencedRelation.actionOnUpdate = relationTmp.actionOnUpdate;
                referencedRelation.isOwner = false;
                referencedRelation.relatedColumn = ownerColumn.name;
                referencedRelation.relatedTable = relationTmp.ownerTable;
                referencedRelation.ownerTable = relationTmp.referencedTable;
                referencedRelation.ownerColumn = relatedColumn.name.toLowerCase();
                referencedRelation.relationType = "OneToOne";

                referencedEntity.Columns.push(col);
            }
        });
        return entities;
    }
    async DisconnectFromServer() {
        if (this.Connection) await this.Connection.close();
    }

    private Connection: any /*Oracle.IConnection*/;
    async ConnectToServer(
        database: string,
        server: string,
        port: number,
        user: string,
        password: string,
        ssl: boolean
    ) {
        let config: any;
        if (user == String(process.env.ORACLE_UsernameSys)) {
            config /*Oracle.IConnectionAttributes*/ = {
                user: user,
                password: password,
                // connectString: `${server}:${port}/ORCLCDB.localdomain/${database}`,
                connectString: `${server}:${port}/${database}`,
                externalAuth: ssl,
                privilege: this.Oracle.SYSDBA
            };
        } else {
            config /*Oracle.IConnectionAttributes*/ = {
                user: user,
                password: password,
                // connectString: `${server}:${port}/ORCLCDB.localdomain/${database}`,
                connectString: `${server}:${port}/${database}`,
                externalAuth: ssl
            };
        }
        let that = this;
        let promise = new Promise<boolean>((resolve, reject) => {
            this.Oracle.getConnection(config, function(err, connection) {
                if (!err) {
                    //Connection successfull
                    that.Connection = connection;

                    resolve(true);
                } else {
                    TomgUtils.LogError(
                        "Error connecting to Oracle Server.",
                        false,
                        err.message
                    );
                    reject(err);
                }
            });
        });

        await promise;
    }

    async CreateDB(dbName: string) {
        var x = await this.Connection.execute(
            `CREATE USER ${dbName} IDENTIFIED BY ${String(
                process.env.ORACLE_Password
            )}`
        );

        var y = await this.Connection.execute(`GRANT CONNECT TO ${dbName}`);
    }
    async UseDB(dbName: string) {}
    async DropDB(dbName: string) {
        var x = await this.Connection.execute(`DROP USER ${dbName} CASCADE`);
    }
    async CheckIfDBExists(dbName: string): Promise<boolean> {
        var x = await this.Connection.execute(
            `select count(*) as CNT from dba_users where username='${dbName.toUpperCase()}'`
        );
        return x.rows[0][0] > 0 || x.rows[0].CNT;
    }
}
