/**
 * mysql数据库
 * @return {[type]} [description]
 */
var mysqlSocket = thinkRequire("MysqlSocket");
var db = module.exports = Db(function(){
    return {
        init: function(config){
            this.super_("init");
            if (config) {
                this.config = config;
            };
            this.lastInsertId = 0;
        },
        /**
         * 连接数据库
         * @param  {[type]} config  [description]
         * @param  {[type]} linknum [description]
         * @return {[type]}         [description]
         */
        connect: function(config, linknum){
            linknum = linknum || 0;
            if (!this.linkIds[linknum]) {
                config = config || this.config;
                var instance = this.linkIds[linknum] = mysqlSocket(config);
                //设置字符集
                instance.query("SET NAMES '" + C('db_charset') + "'");
                this.connected = true;
            };
            return this.linkIds[linknum];
        },
        /**
         * 查询一条sql
         * @param  string str
         * @return promise
         */
        query: function(str){
            this.initConnect(false);
            if (!this.linkId) {
                return getPromise("linkId is null", true);
            };
            this.queryStr = str;
            N('db_query', 1);
            var self = this;
            return this.linkId.query(str);
        },
        /**
         * 执行一条sql, 返回影响的行数
         * @param  {[type]} str [description]
         * @return {[type]}     [description]
         */
        execute: function(str){
            this.initConnect(false);
            if (!this.linkId) {
                return getPromise("linkId is null", true);
            };
            this.queryStr = str;
            N('db_execute', 1);
            var self = this;
            return this.linkId.query(str).then(function(data){
                self.lastInsertId = data.insertId;
                return data.affectedRows || 0;
            })
        },
        /**
         * 获取数据表字段信息
         * @param  string tableName 数据表名
         * @return promise 返回一个promise
         */
        getFields: function(tableName){
            var sql = "SHOW COLUMNS FROM " + this.parseKey(tableName);
            return this.query(sql).then(function(data){
                var ret = {};
                data.forEach(function(item){
                    ret[item.Field] = {
                        "name": item.Field,
                        "type": item.Type,
                        "notnull": item.Null === "",
                        "default": item.Default,
                        "primary": item.Key == 'pri',
                        "autoinc": item.Extra.toLowerCase() == 'auto_increment'
                    };
                });
                return ret;
            });
        },
        /**
         * 获取数据库的表信息
         * @param  {[type]} dbName [description]
         * @return {[type]}        [description]
         */
        getTables: function(dbName){
            var sql = "SHOW TABLES";
            if (dbName) {
                sql = "SHOW TABLES FROM " + dbName;
            };
            return this.query(sql).then(function(data){
                return data.map(function(item){
                    for(var key in item){
                        return item[key];
                    }
                });
            });
        },
        /**
         * 关闭连接
         * @return {[type]} [description]
         */
        close: function(){
            if (this.linkId) {
                this.linkId.close();
                this.linkId = null;
            };
        },
        /**
         * 解析key
         * @param  {[type]} key [description]
         * @return {[type]}     [description]
         */
        parseKey: function(key){
            key = (key || "").trim();
            var reg = /[,\'\"\*\(\)`.\s]/;
            if (!reg.test(key)) {
                key = '`' + key + '`';
            };
            return key;
        },
        /**
         * 获取最后插入的id
         * @return {[type]} [description]
         */
        getLastInsertId: function(){
            return this.lastInsertId;
        }
    }
});