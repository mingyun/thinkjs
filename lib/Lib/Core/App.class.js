/**
 * 应用程序
 * @type {Object}
 */
var cluster = require("cluster");
var App = module.exports = Class(function(){
    return {
        http: null,
        init: function(http){
            this.http = http;
        },
        dispatch: function(){
            //路径解析
            return thinkRequire('Dispatcher')(this.http).run();
        },
        exec: function(){
            var group = this.http.group;
            var controller = '';
            var reg = /^[A-Za-z](\w)*$/;
            var self = this;
            //检测controller名
            if (!reg.test(this.http.controller)) {
                controller = '';
            }else{
                controller = A(group + "/" + this.http.controller, this.http);
            }
            if (!controller) {
                var event = C('empty_controller_event');
                if (event && E(event, true).length > 0) {
                    E(event, this.http.controller, group, this.http);
                    return true;
                };
                console.log(this.http.controller + " controller not found");
                return sendStatus(this.http.res, 404);
            };
            var action = this.http.action;
            var oldAction = action;
            //添加action后缀
            action += C('action_suffix') || "";
            //检测action名
            if (!reg.test(action)) {
                console.log('action name error');
                return sendStatus(this.http.res, 404);
            };
            var initReturnPromise = getPromise(controller.__initReturn);
            //对应的action方法存在
            if (typeof controller[action] == 'function') {
                //方法参数自动绑定，直接从形参里拿到对应的值
                if (C('url_params_bind')) {
                    var toString = controller[action].toString();
                    toString = toString.replace(/((\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s))/mg, '');
                    var match = toString.match(/^function\s*[^\(]*\(\s*([^\)]*)\)/m)[1].split(/,/).filter(function(item){
                        return item;
                    });
                    //匹配到形参
                    if (match && match.length) {
                        var data = [];
                        match.forEach(function(item){
                            var value = self.http.post[item] || self.http.get[item] || "";
                            data.push(value);
                        });
                        return initReturnPromise.then(function(){
                            return self.execAction(controller, action, oldAction, data);
                        })
                    }
                }
                return initReturnPromise.then(function(){
                    return self.execAction(controller, action, oldAction);
                })
            }else{
                //当指定的方法不存在时，调用魔术方法
                //默认为__call方法
                if (C('call_method') && typeof controller[C('call_method')] == 'function') {
                    return initReturnPromise.then(function(){
                        return controller[C('call_method')](action);  
                    });
                };
            }
            sendStatus(this.http.res, 404);
            return getPromise("action: " + action + " not found", true);
        },
        /**
         * 执行一个action, 支持before和after的统一操作
         * 不对每个action都增加一个before和after，而是使用统一的策略
         * 默认before和after调用名__before和__after
         * @param  {[type]} controller [description]
         * @param  {[type]} action     [description]
         * @param  {[type]} oldAction  [description]
         * @param  {[type]} data       [description]
         * @return {[type]}            [description]
         */
        execAction: function(controller, action, oldAction, data){
            var promise = null;
            //before action
            var before = C('before_action_name');
            if (before && typeof controller[before] == 'function') {
                var ret = controller[before].call(controller, oldAction, action);
                promise = getPromise(ret);
            }else{
                promise = getPromise();
            }
            promise = promise.then(function(){
                var ret = null;
                //绑定方法参数
                if (data) {
                    ret = controller[action].apply(controller, data);
                }else{
                    ret = controller[action]();
                }
                return getPromise(ret);
            }).then(function(){
                //after action
                var after = C('after_action_name');
                if (after && typeof controller[after] == 'function') {
                    return controller[after].call(controller, oldAction, action);
                };
             });
            //debug模式下将错误信息打印出来
            if (APP_DEBUG) {
                promise = promise.catch(function(err){
                    console.log(err)
                });
            };
            return promise;
        }
    }
});
/**
 * run
 * @return {[type]} [description]
 */
module.exports.run = function(){
    //命令行调用
    if (CLI_REQUEST) {
        var http = thinkRequire("Http").cli(CLI_REQUEST);
        return App.listener(http);
    };
    var clusterNums = C('use_cluster');
    //不使用cluster
    if (clusterNums === false) {
        return App.createServer();
    }
    if (clusterNums === 0 || clusterNums === true) {
        clusterNums = require('os').cpus().length;
    };
    var cluster = require('cluster');
    if (cluster.isMaster) {
        for (var i = 0; i < clusterNums; i++) {
            cluster.fork();
        }
        cluster.on('exit', function(worker, code, signal) {
            console.log('worker ' + worker.process.pid + ' died');
            process.nextTick(function(){
                cluster.fork();
            });
        });
    }else {
        App.createServer();
    }
}
/**
 * 创建服务
 * @return {[type]} [description]
 */
module.exports.createServer = function(){
    var server = require("http").createServer(function (req, res) {
        thinkRequire("Http")(req, res).run(App.listener);
    });
    var params = [C('port')];
    //禁止外网直接通过IP访问
    if (C('deny_remote_access_by_ip')) {
        params.push("127.0.0.1");
    };
    server.listen.apply(server, params);
};
/**
 * 监听回调函数
 * @param  {[type]} http [description]
 * @return {[type]}      [description]
 */
module.exports.listener = function(http){
    //自动发送thinkjs和版本的header
    http.setHeader("X-Powered-By", "thinkjs-" + THINK_VERSION);
    //初始化Session
    if (C('session_auto_start')) {
        thinkRequire('Session').start(http);
    };
    var instance = App(http);
    var promise = tag ('app_init', http).then(function(){
        return instance.dispatch();
    }).then(function(){
        return tag('app_begin', http);
    }).then(function(){
        return tag('action_init', http);
    }).then(function(){
        return instance.exec();
    }).then(function(){
        return tag('app_end', http);
    });
    //debug模式下将错误信息打印出来
    if (APP_DEBUG) {
        promise = promise.catch(function(err){
            console.log(err);
        })
    };
    return promise;
}