import $$observable from 'symbol-observable'
import ActionTypes from './utils/actionTypes'
import isPlainObject from './utils/isPlainObject'

/**
 * Creates a Redux store that holds the state tree.
 * The only way to change the data in the store is to call `dispatch()` on it.
 *
 * There should only be a single store in your app. To specify how different
 * parts of the state tree respond to actions, you may combine several reducers
 * into a single reducer function by using `combineReducers`.
 *
 * @param {Function} reducer A function that returns the next state tree, given
 * the current state tree and the action to handle.
 * @param {Function} reducer：返回一个完整独立全新的state tree，接受参数（当前state，需要触发actions集合）
 *
 * @param {any} [preloadedState] The initial state. You may optionally specify it
 * to hydrate the state from the server in universal apps, or to restore a
 * previously serialized user session.
 * If you use `combineReducers` to produce the root reducer function, this must be
 * an object with the same shape as `combineReducers` keys.
 * @param {any} [preloadedState] 初始化state，不是必需，可以与服务端渲染水合初始状态，
 * 如果使用combineReduers必需与其中key值一一对应，查看combineReduers实现
 *
 * @param {Function} [enhancer] The store enhancer. You may optionally specify it
 * to enhance the store with third-party capabilities such as middleware,
 * time travel, persistence, etc. The only store enhancer that ships with Redux
 * is `applyMiddleware()`.
 * @param {Function} [enhancer] store的外挂，常用middleware中间件，其他暂时不去深入
 *
 * @returns {Store} A Redux store that lets you read the state, dispatch actions
 * and subscribe to changes.
 */
export default function createStore(reducer, preloadedState, enhancer) {

  // 判断参数个数，类似jq===on参数处理方式
  if (typeof preloadedState === 'function' && typeof enhancer === 'undefined') {
    enhancer = preloadedState
    preloadedState = undefined
  }

  // 首先判断enhancer（常见的便是middlewares中间件），循环回调将跳过此处
  if (typeof enhancer !== 'undefined') {
    if (typeof enhancer !== 'function') {
      throw new Error('Expected the enhancer to be a function.')
    }
    // middlewares详细解释返回值，
    return enhancer(createStore)(reducer, preloadedState)
  }
  // redux为了方便开发者做了很多友好的提示，只有深入源码才知道的良苦用心，reducer只接受是一个函数
  if (typeof reducer !== 'function') {
    throw new Error('Expected the reducer to be a function.')
  }

  // 保存当前的传入值，后边会涉及到这些值的来回更迭
  let currentReducer = reducer
  let currentState = preloadedState
  let currentListeners = []
  // 监听函数事件队列 为什么不写成let nextListeners = currentListeners = [] 风格吗?
  // 还有为什么需要两个listener数组来存放呢？答案再订阅和dispatch里面
  let nextListeners = currentListeners
  // 是否处于dispatch过程中，我也好奇异步dispatch的时候将怎么变化
  let isDispatching = false

  // 当前监听队列与接下来的监听队列指向同一个数组时，slice出新的数组
  function ensureCanMutateNextListeners() {
    if (nextListeners === currentListeners) {
      // 还是为了去除引用，完成next和current的交替，可以将next看作是current的快照
      nextListeners = currentListeners.slice()
    }
  }

  /**
   * Reads the state tree managed by the store.
   *
   * @returns {any} The current state tree of your application.
   */
  // 只有在非触发状态才能通过api获取当前state的快照
  function getState() {
    if (isDispatching) {
      throw new Error(
        'You may not call store.getState() while the reducer is executing. ' +
          'The reducer has already received the state as an argument. ' +
          'Pass it down from the top reducer instead of reading it from the store.'
      )
    }
    // 注意这里闭包了，直接给里currentState，且他是时常变化的值，需要再稳定的时候取值
    return currentState
  }

  /**
   * Adds a change listener. It will be called any time an action is dispatched,
   * and some part of the state tree may potentially have changed. You may then
   * call `getState()` to read the current state tree inside the callback.
   *
   * You may call `dispatch()` from a change listener, with the following
   * caveats:
   *
   * 1. The subscriptions are snapshotted just before every `dispatch()` call.
   * If you subscribe or unsubscribe while the listeners are being invoked, this
   * will not have any effect on the `dispatch()` that is currently in progress.
   * However, the next `dispatch()` call, whether nested or not, will use a more
   * recent snapshot of the subscription list.
   *
   * 2. The listener should not expect to see all state changes, as the state
   * might have been updated multiple times during a nested `dispatch()` before
   * the listener is called. It is, however, guaranteed that all subscribers
   * registered before the `dispatch()` started will be called with the latest
   * state by the time it exits.
   *
   * @param {Function} listener A callback to be invoked on every dispatch.
   * @returns {Function} A function to remove this change listener.
   */
  // dva里面也有监听器，下次去看看源码
  function subscribe(listener) {
    // 老规矩容错
    if (typeof listener !== 'function') {
      throw new Error('Expected the listener to be a function.')
    }

    if (isDispatching) {
      throw new Error(
        'You may not call store.subscribe() while the reducer is executing. ' +
          'If you would like to be notified after the store has been updated, subscribe from a ' +
          'component and invoke store.getState() in the callback to access the latest state. ' +
          'See https://redux.js.org/api-reference/store#subscribe(listener) for more details.'
      )
    }
    // 监听已经完成标志，用于清除监听
    let isSubscribed = true
    // 函数入其名，得到nextListeners
    ensureCanMutateNextListeners()
    // 将监听的事件添加到nextListeners队列中，注意可能添加了队列中已有的事件，不管执行两遍
    nextListeners.push(listener)
    // 返回函数可以移除事件监听
    return function unsubscribe() {
      // 只移除一次
      if (!isSubscribed) {
        return
      }

      if (isDispatching) {
        throw new Error(
          'You may not unsubscribe from a store listener while the reducer is executing. ' +
            'See https://redux.js.org/api-reference/store#subscribe(listener) for more details.'
        )
      }
      // 控制标志位，不多余移除
      isSubscribed = false
      // 再次得到新的nextListeners
      ensureCanMutateNextListeners()
      // 感觉这里如果注册两个相同的事件，会移除前面那个，不知道会不会有问题
      const index = nextListeners.indexOf(listener)
      nextListeners.splice(index, 1)
    }
  }

  /**
   * Dispatches an action. It is the only way to trigger a state change.
   *
   * The `reducer` function, used to create the store, will be called with the
   * current state tree and the given `action`. Its return value will
   * be considered the **next** state of the tree, and the change listeners
   * will be notified.
   *
   * The base implementation only supports plain object actions. If you want to
   * dispatch a Promise, an Observable, a thunk, or something else, you need to
   * wrap your store creating function into the corresponding middleware. For
   * example, see the documentation for the `redux-thunk` package. Even the
   * middleware will eventually dispatch plain object actions using this method.
   *
   * @param {Object} action A plain object representing “what changed”. It is
   * a good idea to keep actions serializable so you can record and replay user
   * sessions, or use the time travelling `redux-devtools`. An action must have
   * a `type` property which may not be `undefined`. It is a good idea to use
   * string constants for action types.
   *
   * @returns {Object} For convenience, the same action object you dispatched.
   *
   * Note that, if you use a custom middleware, it may wrap `dispatch()` to
   * return something else (for example, a Promise you can await).
   */
  // 相当重要的方法，纯粹的dispatch的参数只接受Object类型的，thunk就是对它进行处理进而能传入
  // function用回调的形式重新dispatch，下次再详细thunk和saga
  function dispatch(action) {
    // isPlainObject用于判断是否是对象
    if (!isPlainObject(action)) {
      throw new Error(
        'Actions must be plain objects. ' +
          'Use custom middleware for async actions.'
      )
    }
    // action关键字限制为 type，为了不造成命名上的困惑一般type前缀我会设置与文件夹同名
    if (typeof action.type === 'undefined') {
      throw new Error(
        'Actions may not have an undefined "type" property. ' +
          'Have you misspelled a constant?'
      )
    }

    // 正在dispatch，这里什么情况会出现这个警告呢！！！
    // 在dispatch中嵌套的调用dispatch会触发这类警告，可能是担心dispatchA(dispatchB(dispatchA))的嵌套循环问题把
    if (isDispatching) {
      throw new Error('Reducers may not dispatch actions.')
    }

    try {
      isDispatching = true
      // 进行reduce操作，记得参数是当前state和action对象，返回全新的State对象，这一手操作是react就高兴了
      currentState = currentReducer(currentState, action)
    } finally {
      //完成一波reducer记得复位标志，表示我的完成dispatch。 
      isDispatching = false
    }

    // 执行事件队列前才拿到最新的listenters，在此之前可能会出现订阅与退订的嵌套等问题，暂存的nextlisteners可以保证dispatch的正常执行
    // 假如出现listenerA(){store.subscribe(listenerA);}的嵌套情况，listeners的长度将再每一次执行延长一直至无限长
    // 当然如果采用len = listeners.length；直接固定循环次数可以解决现在的情况，但是退订等事件的发生也会出现问题，所以暂存是最安全的做法
    const listeners = (currentListeners = nextListeners)
    // 为什么要用for循环不用foreach，想想forEach对空元素的处理的性能问题把
    for (let i = 0; i < listeners.length; i++) {
      const listener = listeners[i]
      // 为什么不直接listeners[i]（）执行呢？而是负值单独调用呢？
      // 赋值之后this的指向不再是listens而是window
      listener()
    }

    // 返回了整个action对象
    return action
  }

  /**
   * Replaces the reducer currently used by the store to calculate the state.
   *
   * You might need this if your app implements code splitting and you want to
   * load some of the reducers dynamically. You might also need this if you
   * implement a hot reloading mechanism for Redux.
   *
   * @param {Function} nextReducer The reducer for the store to use instead.
   * @returns {void}
   */

  // 替换reducer函数
  function replaceReducer(nextReducer) {
    if (typeof nextReducer !== 'function') {
      throw new Error('Expected the nextReducer to be a function.')
    }

    currentReducer = nextReducer
    // 触发私有的replace action
    dispatch({ type: ActionTypes.REPLACE })
  }

  /**
   * Interoperability point for observable/reactive libraries.
   * @returns {observable} A minimal observable of state changes.
   * For more information, see the observable proposal:
   * https://github.com/tc39/proposal-observable
   */
  // 可以看作是对redux观察者的一个扩展，可作为全局的每次dispatch都执行方法入口
  function observable() {
    const outerSubscribe = subscribe
    return {
      /**
       * The minimal observable subscription method.
       * @param {Object} observer Any object that can be used as an observer.
       * The observer object should have a `next` method.
       * @returns {subscription} An object with an `unsubscribe` method that can
       * be used to unsubscribe the observable from the store, and prevent further
       * emission of values from the observable.
       */
      // 需要传入一个带next方法的对象，将返回退订钩子
      subscribe(observer) {
        if (typeof observer !== 'object' || observer === null) {
          throw new TypeError('Expected the observer to be an object.')
        }

        function observeState() {
          if (observer.next) {
            // next方法将获得当时的store
            observer.next(getState())
          }
        }

        observeState()
        const unsubscribe = outerSubscribe(observeState)
        // 返回包含退订对象
        return { unsubscribe }
      },
      // 用于获取observeable，这名字取的。。。
      [$$observable]() {
        return this
      }
    }
  }

  // When a store is created, an "INIT" action is dispatched so that every
  // reducer returns their initial state. This effectively populates
  // the initial state tree.
  // 初始化store对象
  dispatch({ type: ActionTypes.INIT })

  return {
    dispatch,
    subscribe,
    getState,
    replaceReducer,
    [$$observable]: observable
  }
}
