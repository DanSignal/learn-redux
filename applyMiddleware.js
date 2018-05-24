import compose from './compose'

/**
 * Creates a store enhancer that applies middleware to the dispatch method
 * of the Redux store. This is handy for a variety of tasks, such as expressing
 * asynchronous actions in a concise manner, or logging every action payload.
 *
 * See `redux-thunk` package as an example of the Redux middleware.
 *
 * Because middleware is potentially asynchronous, this should be the first
 * store enhancer in the composition chain.
 *
 * Note that each middleware will be given the `dispatch` and `getState` functions
 * as named arguments.
 *
 * @param {...Function} middlewares The middleware chain to be applied.
 * @returns {Function} A store enhancer applying the middleware.
 */
// 非常精髓的一段代码
// createStore中以enhancer(createStore)(reducer, preloadedState)调用
export default function applyMiddleware(...middlewares) {
    // 二阶函数参数...args对应reducer, preloadedState
    return createStore => (...args) => {
        const store = createStore(...args)
        // 这里不应该是 const dispatch = store.dispatch？？有些版本出现这样
        // 猜测：这里避免使用到没有中间件处理过的disptch，后面将传入完整的store.dispatch作为根参数，
        // 求解如果这里只是个警告函数，每个中间件接受到的（{ dispatch, getState }）又是什么呢？
        // 好吧，我又又想到答案了，再下面
        let dispatch = () => {
            throw new Error(
                `Dispatching while constructing your middleware is not allowed. ` +
                `Other middleware would not be applied to this dispatch.`
            )
        }
        // 中间件获取到的能力，获取store快照（isDispatching？？？怎么判断的），触发reducer
        const middlewareAPI = {
            getState: store.getState,
            // 我就是上面的答案：这里dispatch用闭包并不是直接的引用，dispatch会根据dispatch = compose(...chain)(store.dispatch)
            // 而变化，在此之前调用dispatch会爆出警告！！！
            dispatch: (...args) => dispatch(...args)
        }
        // middleware应该是高阶函数，return 了一个function在chain数组
        // 对应thunk的createThunkMiddleware({dispatch, getStat})，这里只要注意传入了什么，thunk内详细分析怎么运行中间件
        const chain = middlewares.map(middleware => middleware(middlewareAPI))
        // 将store.dispatch作为二阶参数传入，最终将对应中间件最内层的action，
        // 注意下面这个例子：
        // applyMiddleware(log1, log2, log3)，在这里通过洋葱函数的处理dispatch变成log11(log22(log33(store.dispatch)))这样一个函数
        // log11是log1({dispatch, getState})的返回函数，以此类推，这种结构也限定里中间件函数的基本结构是
        // ({ dispatch, getState }) => next => action => {} ，最开始可能对这个结构很迷糊，why，看下面
        dispatch = compose(...chain)(store.dispatch)

        // 对应返回在了createStore里即Store，全新的dispatch诞生
        return {
            ...store,
            dispatch
        }
    }
}

// 觉得把redux-thunk的代码一起贴出来才有参照性
function createThunkMiddleware(extraArgument) {
    // 其实thunk内容实在是简洁，判断类型将dispatch放入到函数里面，这里的dispatch是层层包装过的
    // 那么我们来分析针对整个箭头函数和中间件结构进行分析一下
    // log11(log22(log33(store.dispatch)))，
    // log11的action对应log22(log33(store.dispatch))，
    // log22的action对应log33(store.dispatch)，
    // log33的action对应store.dispatch，形成一个层层执行，最终落实再原始的store.dispatch作用上，
    // 
    // 而执行顺序有点像冒泡，从外到里再从里到外，如果上面的log每个都有before和after的话，顺序将是
    // log11.before > log22.before > log33.before > store.dispatch > log33.after > log22.after > log11.after > end
    // 每一个中间件将对dispatch之前和之后作些动作
    return ({ dispatch, getState }) => next => action => {
      if (typeof action === 'function') {
        return action(dispatch, getState, extraArgument);
      }
  
      return next(action);
    };
}
  
const thunk = createThunkMiddleware();
thunk.withExtraArgument = createThunkMiddleware;
  
//  export default thunk;

// 调用方式 createStore(reducer, applyMiddleware(thunk))

