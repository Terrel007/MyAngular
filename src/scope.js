/* jshint globalstrict:true */

'use strict';
function Scope(){
    this.$$watchers=[];
    this.$$lastDirtyWatch=null;
    this.$$asyncQueue=[];
    this.$$applyAsyncQueue=[];
    this.$$applyAsyncId=null; //keep track of whether a setTimeout to drain the queue has already been scheduled.
    this.$$postDigestQueue=[]; // run code after the digest
    this.$$phase=null;
}

function initWatchVal(){

}

Scope.prototype.$watch=function(watchFn,listenerFn,valueEq){
    var watcher={
        watchFn:watchFn,
        //listenerFn:listenerFn, 
        listenerFn:listenerFn||function(){}, //put noop function in listener place if the listener function is omitted
        valueEq:!!valueEq,
        last:initWatchVal //用引用类型值初始化
    };

    this.$$watchers.push(watcher);
    this.$$lastDirtyWatch = null;
};

Scope.prototype.$$areEqual = function (newValue, oldValue, valueEq) {
    if (valueEq) {
        return _.isEqual(newValue, oldValue);
    } else {
        return newValue === oldValue||
            (typeof newValue==='number'&&typeof oldValue==='number'&&
            isNaN(newValue)&&isNaN(oldValue)); //handle NaN
    }
};

// Scope.prototype.$digest=function(){
//     var self=this;
//     var newValue,oldValue;
//     _.forEach(this.$$watchers,function(watcher){
//         newValue=watcher.watchFn(self);
//         oldValue=watcher.last;
//         if(newValue!=oldValue){
//             watcher.last=newValue;
//             // watcher.listenerFn(newValue,oldValue,self);
//             watcher.listenerFn(newValue,(oldValue===initWatchVal?newValue:oldValue),self); //call the watch listener with newValue as oldValue the first time.avoid leak memory
//         }
//     });
// };

Scope.prototype.$digest=function(){
    var ttl=10; //time to live
    var dirty;
    this.$$lastDirtyWatch=null;
    this.$beginPhase('$digest');

    if(this.$$applyAsyncId){
        clearTimeout(this.$$applyAsyncId);
        this.$$flushApplyAsync();//if there's an $applyAsync flush timeout currently pending,we cancel it and flush the work immediately.
    }

    do{
        while(this.$$asyncQueue.length){
            var asyncTask=this.$$asyncQueue.shift();
            asyncTask.scope.$eval(asyncTask.expression);
            //asyncTask();
        }
        dirty=this.$$digestOnce();        
        if((dirty||this.$$asyncQueue.length)&&!(ttl--)){
            this.$clearPhase();
            throw "10 digest iterations reached";
        }
    }while(dirty||this.$$asyncQueue.length); //this.$$asyncQueue.length: run evalAsync function even when data is not dirty.
    this.$clearPhase();

    while(this.$$postDigestQueue.length){
        this.$$postDigestQueue.shift()();
    }
};

Scope.prototype.$$digestOnce=function(){
    var self=this;
    var newValue,oldValue,dirty;
    _.forEach(this.$$watchers,function(watcher){
        newValue=watcher.watchFn(self);
        oldValue=watcher.last;
        // if(newValue!==oldValue){
        if(!self.$$areEqual(newValue,oldValue,watcher.valueEq)){
            self.$$lastDirtyWatch=watcher;
            // watcher.last=newValue;
            watcher.last=(watcher.valueEq?_.cloneDeep(newValue):newValue);
            watcher.listenerFn(newValue,(oldValue===initWatchVal?newValue:oldValue),self);

            dirty=true;
        }else if(self.$$lastDirtyWatch===watcher){
            return false;
        }
    });
    return dirty;
};

Scope.prototype.$$postDigest=function(fn){
    this.$$postDigestQueue.push(fn);
}

// Scope.prototype.$eval=function(fn,arg){
//     var arr=[this];
//     if(arg) arr.push(arg);
//     return fn.apply(this,arr);
// }

Scope.prototype.$eval=function(expr,locals){
    return expr(this,locals);
};

Scope.prototype.$evalAsync=function(expr){
    var self=this;
    //If you call $evalAsync when a digest is already running, your function will be evaluated during that digest. If there is no digest running, then schedule a one and start it.
    if(!self.$$phase&&!self.$$asyncQueue.length){
        setTimeout(function(){
            if(self.$$asyncQueue.length){
                self.$digest();
            }
        },0);
    }
    self.$$asyncQueue.push({scope:this,expression:expr});
    // self.$$asyncQueue.push(function(){
    //     self.$eval(expr);
    // })
};

Scope.prototype.$apply=function(expr){
    try{
        this.$beginPhase('$apply');        
        return this.$eval(expr);
    }finally{
        this.$clearPhase();
        this.$digest();
    }
};

Scope.prototype.$applyAsync=function(expr){
    var self=this;
    self.$$applyAsyncQueue.push(function(){
        self.$eval(expr);
    });
    if(self.$$applyAsyncId===null){
        self.$$applyAsyncId=setTimeout(function(){
            // self.$apply(function(){
            //     while(self.$$applyAsyncQueue.length){
            //         self.$$applyAsyncQueue.shift()();
            //     }
            //     self.$$applyAsyncId=null;
            // });
            // self.$apply(_.bind(self.$$flushApplyAsync,self));
            self.$apply(function(){
                self.$$flushApplyAsync();
            })
        },0);
    }
};

Scope.prototype.$$flushApplyAsync=function(){
    while(this.$$applyAsyncQueue.length){
        this.$$applyAsyncQueue.shift()();
    }
    this.$$applyAsyncId=null;
}



Scope.prototype.$beginPhase=function(phase){
    if(this.$$phase){
        throw this.$$phase+' already in progress';
    }
    this.$$phase=phase;
};

Scope.prototype.$clearPhase=function(){
    this.$$phase=null;
}