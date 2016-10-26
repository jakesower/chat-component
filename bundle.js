(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
module.exports = function( state ) {
  let input = document.getElementById( 'input' ),
      submit = document.getElementById( 'submit' );

  submit.addEventListener( 'click', function (event) {
    event.preventDefault();
    state.messages.push( input.value );
    input.value = '';
  });
}

},{}],2:[function(require,module,exports){
module.exports = {
  message: function (state, data) {
    state.messages.push( data );
    return state;
  }
}

},{}],3:[function(require,module,exports){
const bindObject = require('simulacra');

const listeners = require('./listeners');
const actions = require('./actions');

module.exports = function( transport ) {
  let state = {
    name: "Anonymous",
    messages: [],
    initialized: false
  };

  let template = document.getElementById( 'chat-template' );
  let node = bindObject( state, [ template, {
    messages: '#messages'
  }]);
  document.getElementById( 'main' ).appendChild( node );

  actions( state );

  transport.onmessage = function( event ) {
    state = listeners[ event.type ]( state, event.data );
  }
};

},{"./actions":1,"./listeners":2,"simulacra":8}],4:[function(require,module,exports){
const chat = require('./lib/chat/main');

transport = {};

chat( transport );

},{"./lib/chat/main":3}],5:[function(require,module,exports){
'use strict'

var processNodes = require('./process_nodes')
var keyMap = require('./key_map')

var markerMap = processNodes.markerMap
var hasDefinitionKey = keyMap.hasDefinition
var isBoundToParentKey = keyMap.isBoundToParent
var replaceAttributeKey = keyMap.replaceAttribute
var retainElementKey = keyMap.retainElement

// This is a global store that keeps the previously assigned values of keys
// on objects. It is keyed by the bound object and valued by a memoized object
// that contains the same keys.
var storeMemo = new WeakMap()

// Internal meta-information about objects. Keyed by bound object and valued by
// meta-information object.
var storeMeta = new WeakMap()

// Element tag names for elements that should update data on change.
var updateTags = [ 'INPUT', 'TEXTAREA' ]


module.exports = bindKeys

// Expose internals, for rehydration purposes.
bindKeys.storeMeta = storeMeta
bindKeys.addToPath = addToPath
bindKeys.findTarget = findTarget


/**
 * Define getters & setters. This function is the internal entry point to a lot
 * of functionality.
 *
 * @param {*} [scope]
 * @param {Object} obj
 * @param {Object} def
 * @param {Node} parentNode - This is not the same as
 * `Node.prototype.parentNode`, this is the internal parent node if the key
 * was bound to its parent.
 * @param {Array} path
 */
function bindKeys (scope, obj, def, parentNode, path) {
  var meta, key, keyPath

  if (typeof obj !== 'object' || obj === null)
    throw new TypeError(
      'Invalid type of value "' + obj + '", object expected.')

  storeMemo.set(obj, {})

  meta = {}
  storeMeta.set(obj, meta)

  for (key in def) {
    keyPath = path.concat(key)
    keyPath.root = path.root
    keyPath.target = obj

    meta[key] = {
      keyPath: keyPath,
      activeNodes: [],
      previousValues: [],
      valueIsArray: null
    }

    bindKey(scope, obj, def, key, parentNode, path)
  }
}


// This is an internal function, the arguments aren't pretty.
function bindKey (scope, obj, def, key, parentNode, path) {
  var document = scope ? scope.document : window.document
  var memo = storeMemo.get(obj)
  var meta = storeMeta.get(obj)[key]
  var branch = def[key]
  var node = branch[0]
  var change = !branch[hasDefinitionKey] && branch[1]
  var definition = branch[hasDefinitionKey] && branch[1]
  var mount = branch[2]

  // Temporary keys.
  var keyPath = meta.keyPath
  var activeNodes = meta.activeNodes
  var previousValues = meta.previousValues
  var valueIsArray = meta.valueIsArray

  // For initialization, call this once.
  if (branch[isBoundToParentKey]) parentSetter(obj[key])
  else setter(obj[key])

  Object.defineProperty(obj, key, {
    get: getter,
    set: branch[isBoundToParentKey] ? parentSetter : setter,
    enumerable: true,
    configurable: true
  })

  function getter () { return memo[key] }

  // Special case for binding same node as parent.
  function parentSetter (x) {
    var previousValue = memo[key]
    var returnValue

    // Check for no-op.
    if (x === previousValue) return x

    // Need to qualify this check for non-empty value.
    if (definition && x != null)
      bindKeys(scope, x, definition, parentNode, keyPath)

    else if (change) {
      returnValue = change(parentNode, x, previousValue, keyPath)
      if (returnValue !== void 0)
        changeValue(parentNode, returnValue, branch[replaceAttributeKey])
    }

    // If nothing went wrong, set the memoized value.
    memo[key] = x

    return x
  }

  function setter (x) {
    var marker = markerMap.get(branch)
    var fragment, value, currentNode
    var a, b, i, j

    valueIsArray = meta.valueIsArray = Array.isArray(x)

    // Assign custom mutator methods on the array instance.
    if (valueIsArray) {
      value = x

      // Some mutators such as `sort`, `reverse`, `fill`, `copyWithin` are
      // not present here. That is because they trigger the array index
      // setter functions by assigning on them internally.

      // These mutators may alter length.
      value.pop = pop
      value.push = push
      value.shift = shift
      value.unshift = unshift
      value.splice = splice

      // Handle array index assignment.
      for (i = 0, j = value.length; i < j; i++)
        defineIndex(value, i)
    }
    else value = [ x ]

    // Handle rendering to the DOM. This algorithm tries to batch insertions
    // into as few document fragments as possible.
    for (i = 0, j = Math.max(previousValues.length, value.length);
      i < j; i++) {
      a = value[i]
      b = previousValues[i]
      currentNode = a !== b ? replaceNode(a, b, i) : null

      if (currentNode) {
        if (!fragment) fragment = document.createDocumentFragment()
        fragment.appendChild(currentNode)
        continue
      }

      // If the value was empty and a current fragment exists, need to insert
      // the current document fragment.
      if (!fragment) continue

      marker.parentNode.insertBefore(fragment,
        getNextNode(i + 1, activeNodes) || marker)
    }

    // Terminal behavior.
    if (fragment)
      marker.parentNode.insertBefore(fragment, marker)

    // Reset length to current values, implicitly deleting indices and
    // allowing for garbage collection.
    if (value.length !== previousValues.length)
      previousValues.length = activeNodes.length = value.length

    // If nothing went wrong, set the memoized value.
    memo[key] = x

    return x
  }

  function defineIndex (array, i) {
    var value = array[i]

    Object.defineProperty(array, i, {
      get: function () { return value },
      set: function (x) {
        var marker = markerMap.get(branch)
        var a, b, currentNode

        value = x
        a = array[i]
        b = previousValues[i]

        if (a !== b) currentNode = replaceNode(a, b, i)

        if (currentNode)
          marker.parentNode.insertBefore(currentNode,
            getNextNode(i + 1, activeNodes) || marker)
      },
      enumerable: true,
      configurable: true
    })
  }

  function removeNode (value, previousValue, i) {
    var marker = markerMap.get(branch)
    var activeNode = activeNodes[i]
    var endPath = keyPath
    var returnValue

    delete previousValues[i]

    if (activeNode) {
      delete activeNodes[i]

      if (valueIsArray) endPath = addToPath(path, keyPath, i)

      if (change)
        returnValue = change(activeNode, null, previousValue, endPath)
      else if (definition && mount) {
        findTarget(endPath, keyPath)
        returnValue = mount(activeNode, null, previousValue, endPath)
      }

      // If a change or mount function returns the retain element symbol,
      // skip removing the element from the DOM.
      if (returnValue !== retainElementKey)
        marker.parentNode.removeChild(activeNode)
    }
  }

  // The return value of this function is a Node to be added, otherwise null.
  function replaceNode (value, previousValue, i) {
    var activeNode = activeNodes[i]
    var currentNode = node
    var endPath = keyPath
    var returnValue

    // Cast values to null if undefined.
    if (value === void 0) value = null
    if (previousValue === void 0) previousValue = null

    // If value is null, just remove it.
    if (value === null) {
      removeNode(null, previousValue, i)
      return null
    }

    if (valueIsArray) endPath = addToPath(path, keyPath, i)

    previousValues[i] = value

    if (definition) {
      if (activeNode) removeNode(value, previousValue, i)
      currentNode = processNodes(scope, node, definition)
      endPath.target = valueIsArray ? value[i] : value
      bindKeys(scope, value, definition, currentNode, endPath)
      if (mount) {
        findTarget(endPath, keyPath)
        mount(currentNode, value, null, endPath)
      }
    }

    else {
      currentNode = activeNode || node.cloneNode(true)

      if (change) {
        returnValue = change(currentNode, value, previousValue, endPath)
        if (returnValue !== void 0)
          changeValue(currentNode, returnValue, branch[replaceAttributeKey])
      }
      else {
        // Add default update behavior. Note that this event does not get
        // removed, since it is assumed that it will be garbage collected.
        if (previousValue === null && ~updateTags.indexOf(currentNode.tagName))
          currentNode.addEventListener('input',
            updateChange(branch[replaceAttributeKey], endPath, key))

        changeValue(currentNode, value, branch[replaceAttributeKey])
      }

      // Do not actually add an element to the DOM if it's only a change
      // between non-empty values.
      if (activeNode) return null
    }

    activeNodes[i] = currentNode

    return currentNode
  }


  // Below are optimized array mutator methods. They have to exist within
  // this closure. Note that the native implementations of these methods do
  // not trigger setter functions on array indices.

  function pop () {
    var i = this.length - 1
    var previousValue = previousValues[i]
    var value = Array.prototype.pop.call(this)

    removeNode(null, previousValue, i)
    previousValues.length = activeNodes.length = this.length

    return value
  }

  function push () {
    var marker = markerMap.get(branch)
    var i = this.length
    var j, fragment, currentNode

    // Passing arguments to apply is fine.
    var value = Array.prototype.push.apply(this, arguments)

    if (arguments.length) {
      fragment = document.createDocumentFragment()

      for (j = i + arguments.length; i < j; i++) {
        currentNode = replaceNode(this[i], null, i)
        if (currentNode) fragment.appendChild(currentNode)
        defineIndex(this, i)
      }

      marker.parentNode.insertBefore(fragment, marker)
    }

    return value
  }

  function shift () {
    removeNode(null, previousValues[0], 0)

    Array.prototype.shift.call(previousValues)
    Array.prototype.shift.call(activeNodes)

    return Array.prototype.shift.call(this)
  }

  function unshift () {
    var marker = markerMap.get(branch)
    var i = this.length
    var j, k, fragment, currentNode

    // Passing arguments to apply is fine.
    var value = Array.prototype.unshift.apply(this, arguments)

    Array.prototype.unshift.apply(previousValues, arguments)
    Array.prototype.unshift.apply(activeNodes, Array(k))

    if (arguments.length) {
      fragment = document.createDocumentFragment()

      for (j = 0, k = arguments.length; j < k; j++) {
        currentNode = replaceNode(arguments[j], null, j)
        if (currentNode) fragment.appendChild(currentNode)
      }

      for (j = i + arguments.length; i < j; i++) defineIndex(this, i)

      marker.parentNode.insertBefore(fragment,
        getNextNode(arguments.length, activeNodes) || marker)
    }

    return value
  }

  function splice (start, count) {
    var marker = markerMap.get(branch)
    var insert = []
    var i, j, k, fragment, value, currentNode

    for (i = start, j = start + count; i < j; i++)
      removeNode(null, previousValues[i], i)

    for (i = 2, j = arguments.length; i < j; i++)
      insert.push(arguments[i])

    // Passing arguments to apply is fine.
    Array.prototype.splice.apply(previousValues, arguments)

    // In this case, avoid setting new values.
    Array.prototype.splice.apply(activeNodes,
      [ start, count ].concat(Array(insert.length)))

    value = Array.prototype.splice.apply(this, arguments)

    if (insert.length) {
      fragment = document.createDocumentFragment()

      for (i = start + insert.length - 1, j = start; i >= j; i--) {
        currentNode = replaceNode(insert[i - start], null, i)
        if (currentNode) fragment.appendChild(currentNode)
      }

      marker.parentNode.insertBefore(fragment,
        getNextNode(start + insert.length, activeNodes) || marker)
    }

    k = insert.length - count

    if (k < 0)
      previousValues.length = activeNodes.length = this.length

    else if (k > 0)
      for (i = this.length - k, j = this.length; i < j; i++)
        defineIndex(this, i)

    return value
  }
}


// Default behavior when a return value is given for a change function.
function changeValue (node, value, attribute) {
  switch (attribute) {
  case 'checked':
    node.checked = Boolean(value)
    break
  case 'value':
    // Prevent some misbehavior in certain browsers when setting a value to
    // itself, i.e. text caret not in the correct position.
    if (node.value !== value) node.value = value
    break
  default:
    node[attribute] = value
  }
}


// Find next node in a potentially sparse array.
function getNextNode (index, activeNodes) {
  var i, j, nextNode

  for (i = index, j = activeNodes.length; i < j; i++)
    if (activeNodes[i]) {
      nextNode = activeNodes[i]
      break
    }

  return nextNode
}


// Add index to the end of a path.
function addToPath (path, keyPath, i) {
  var endPath = keyPath.concat(i)

  endPath.root = path.root
  endPath.target = path.target || path.root

  return endPath
}


// Find and set the new target, when dealing with nested objects.
function findTarget (endPath, keyPath) {
  var i, j

  endPath.target = endPath.root

  for (i = 0, j = keyPath.length - 1; i < j; j++)
    endPath.target = endPath.target[keyPath[i]]
}


// Internal event listener to update data on input change.
function updateChange (targetKey, path, key) {
  var target = path.target
  var lastKey = path[path.length - 1]
  var replaceKey = key

  if (typeof lastKey === 'number') {
    target = target[key]
    replaceKey = lastKey
  }

  return function handleChange (event) {
    target[replaceKey] = event.target[targetKey]
  }
}

},{"./key_map":9,"./process_nodes":10}],6:[function(require,module,exports){
'use strict'


module.exports = featureCheck


/**
 * Check if capabilities are available, or throw an error.
 *
 * @param {*} globalScope
 */
function featureCheck (globalScope) {
  var features = [
    // ECMAScript features.
    [ Object, 'defineProperty' ],
    [ Object, 'freeze' ],
    [ Object, 'isFrozen' ],
    [ WeakMap ],

    // DOM features.
    [ 'document', 'createDocumentFragment' ],
    [ 'document', 'createTreeWalker' ],
    [ 'Node', 'prototype', 'appendChild' ],
    [ 'Node', 'prototype', 'contains' ],
    [ 'Node', 'prototype', 'insertBefore' ],
    [ 'Node', 'prototype', 'isEqualNode' ],
    [ 'Node', 'prototype', 'removeChild' ]
  ]
  var i, j, k, l, feature, path

  for (i = 0, j = features.length; i < j; i++) {
    path = features[i]

    if (typeof path[0] === 'string') {
      feature = globalScope

      for (k = 0, l = path.length; k < l; k++) {
        if (!(path[k] in feature)) throw new Error('Missing ' +
          path.slice(0, k + 1).join('.') + ' feature which is required.')

        feature = feature[path[k]]
      }
    }

    else {
      feature = path[0]

      for (k = 1, l = path.length; k < l; k++) {
        if (k > 1) feature = feature[path[k]]

        if (typeof feature === 'undefined') throw new Error('Missing ' +
          path[0].name + path.slice(1, k + 1).join('.') +
          ' feature which is required.')
      }
    }
  }
}

},{}],7:[function(require,module,exports){
'use strict'

var keyMap = require('./key_map')
var retainElement = keyMap.retainElement
var hasMutationObserver = typeof MutationObserver !== 'undefined'
var hasDocument = typeof document !== 'undefined'


module.exports = {
  setDefault: setDefault,
  bindEvents: bindEvents,
  animate: animate,
  flow: flow,

  // Alias for flow.
  chain: flow
}


function setDefault (node, value) {
  return value != null ? value : void 0
}


function bindEvents (events, useCapture) {
  var listeners = {}

  if (useCapture === void 0) useCapture = false

  return function (node, value, previousValue, path) {
    var key

    if (value == null)
      for (key in events)
        node.removeEventListener(key, listeners[key], useCapture)
    else if (previousValue == null)
      for (key in events) {
        listeners[key] = makeEventListener(events[key], path)
        node.addEventListener(key, listeners[key], useCapture)
      }
  }

  function makeEventListener (fn, path) {
    return function eventListener (event) {
      return fn(event, path)
    }
  }
}


function animate (insertClass, mutateClass, removeClass, retainTime) {
  return function (node, value, previousValue) {
    var observer

    if (!('classList' in node)) return void 0

    if (value == null) {
      if (insertClass) node.classList.remove(insertClass)
      if (removeClass) node.classList.add(removeClass)
      if (retainTime) {
        setTimeout(function () {
          node.parentNode.removeChild(node)
        }, retainTime)

        return retainElement
      }
    }
    else if (value != null && previousValue != null && mutateClass) {
      if (node.classList.contains(mutateClass)) {
        node.classList.remove(mutateClass)

        // Hack to trigger reflow.
        void node.offsetWidth
      }

      node.classList.add(mutateClass)
    }
    else if (previousValue == null && insertClass)
      // Trigger class addition after the element is inserted.
      if (hasMutationObserver && hasDocument &&
        !document.documentElement.contains(node)) {
        observer = new MutationObserver(function (mutations) {
          var i, j, k, l, mutation, addedNode

          for (i = 0, j = mutations.length; i < j; i++) {
            mutation = mutations[i]

            for (k = 0, l = mutation.addedNodes.length; k < l; k++) {
              addedNode = mutation.addedNodes[k]

              if (addedNode === node) {
                // Hack to trigger reflow.
                void node.offsetWidth

                node.classList.add(insertClass)
                observer.disconnect()
              }
            }
          }
        })

        observer.observe(document.documentElement, {
          childList: true, subtree: true
        })
      }
      else node.classList.add(insertClass)

    return void 0
  }
}


function flow () {
  var args = arguments

  return function (node, value, previousValue, path) {
    var i, returnValue, result

    for (i = 0; i < args.length; i++) {
      returnValue = args[i](node, value, previousValue, path)
      if (returnValue !== void 0) result = returnValue
    }

    return result
  }
}

},{"./key_map":9}],8:[function(require,module,exports){
'use strict'

var processNodes = require('./process_nodes')
var bindKeys = require('./bind_keys')
var keyMap = require('./key_map')
var helpers = require('./helpers')
var rehydrate = require('./rehydrate')
var featureCheck = require('./feature_check')

var helper
var isArray = Array.isArray
var hasDefinitionKey = keyMap.hasDefinition
var replaceAttributeKey = keyMap.replaceAttribute
var isBoundToParentKey = keyMap.isBoundToParent
var isProcessedKey = keyMap.isProcessed

// Element tag names which should have value replaced.
var replaceValue = [ 'INPUT', 'TEXTAREA', 'PROGRESS' ]

// Input types which use the "checked" attribute.
var replaceChecked = [ 'checkbox', 'radio' ]

// Symbol for retaining an element instead of removing it.
Object.defineProperty(simulacra, 'retainElement', {
  enumerable: true, value: keyMap.retainElement
})

// Option to use comment nodes as markers.
Object.defineProperty(simulacra, 'useCommentNode', {
  get: function () { return processNodes.useCommentNode },
  set: function (value) { processNodes.useCommentNode = value },
  enumerable: true
})

// Assign helpers on the main export.
for (helper in helpers)
  simulacra[helper] = helpers[helper]


module.exports = simulacra


/**
 * Bind an object to the DOM.
 *
 * @param {Object} obj
 * @param {Object} def
 * @param {Node} [matchNode]
 * @return {Node}
 */
function simulacra (obj, def, matchNode) {
  var document = this ? this.document : window.document
  var Node = this ? this.Node : window.Node
  var node, query, path

  featureCheck(this || window)

  if (obj === null || typeof obj !== 'object' || isArray(obj))
    throw new TypeError('First argument must be a singular object.')

  if (!isArray(def))
    throw new TypeError('Second argument must be an array.')

  if (typeof def[0] === 'string') {
    query = def[0]
    def[0] = document.querySelector(query)
    if (!def[0]) throw new Error(
      'Top-level Node "' + query + '" could not be found in the document.')
  }
  else if (!(def[0] instanceof Node)) throw new TypeError(
    'The first position of the top-level must be either a Node or a CSS ' +
    'selector string.')

  if (!def[isProcessedKey]) {
    // Auto-detect template tag.
    if ('content' in def[0]) def[0] = def[0].content

    ensureNodes(this, def[0], def[1])
    setFrozen(def)
  }

  node = processNodes(this, def[0], def[1])

  path = []
  path.root = obj
  bindKeys(this, obj, def[1], node, path)

  if (matchNode) {
    rehydrate(this, obj, def[1], node, matchNode)
    return matchNode
  }

  return node
}


/**
 * Internal function to mutate string selectors into Nodes and validate that
 * they are allowed.
 *
 * @param {Object} [scope]
 * @param {Element} parentNode
 * @param {Object} def
 */
function ensureNodes (scope, parentNode, def) {
  var Element = scope ? scope.Element : window.Element
  var adjacentNodes = []
  var i, j, key, query, branch, boundNode, ancestorNode, matchedNodes

  if (typeof def !== 'object') throw new TypeError(
    'The second position must be an object.')

  for (key in def) {
    branch = def[key]

    // Change function or definition object bound to parent.
    if (typeof branch === 'function' || (typeof branch === 'object' &&
      branch !== null && !Array.isArray(branch)))
      def[key] = branch = [ parentNode, branch ]

    // Cast CSS selector string to array.
    else if (typeof branch === 'string') def[key] = branch = [ branch ]

    else if (!Array.isArray(branch))
      throw new TypeError('The binding on key "' + key + '" is invalid.')

    // Dereference CSS selector string to actual DOM element.
    if (typeof branch[0] === 'string') {
      query = branch[0]

      // May need to get the node above the parent, in case of binding to
      // the parent node.
      ancestorNode = parentNode.parentNode || parentNode

      // Match all nodes for the selector, pick the first and remove the rest.
      matchedNodes = ancestorNode.querySelectorAll(query)

      if (!matchedNodes.length) throw new Error(
        'An element for selector "' + query + '" was not found.')

      for (i = 1, j = matchedNodes.length; i < j; i++)
        matchedNodes[i].parentNode.removeChild(matchedNodes[i])

      branch[0] = matchedNodes[0]
    }
    else if (!(branch[0] instanceof Element))
      throw new TypeError('The first position on key "' + key +
        '" must be a DOM element or a CSS selector string.')

    // Auto-detect template tag.
    if ('content' in branch[0]) branch[0] = branch[0].content

    boundNode = branch[0]

    if (typeof branch[1] === 'object' && branch[1] !== null) {
      Object.defineProperty(branch, hasDefinitionKey, { value: true })
      if (branch[2] && typeof branch[2] !== 'function')
        throw new TypeError('The third position on key "' + key +
          '" must be a function.')
    }
    else if (branch[1] && typeof branch[1] !== 'function')
      throw new TypeError('The second position on key "' + key +
        '" must be an object or a function.')

    // Special case for binding to parent node.
    if (parentNode === boundNode) {
      Object.defineProperty(branch, isBoundToParentKey, { value: true })
      if (branch[hasDefinitionKey]) ensureNodes(scope, boundNode, branch[1])
      else if (typeof branch[1] === 'function')
        setReplaceAttribute(branch, boundNode)
      else console.warn( // eslint-disable-line
        'A change function was not defined on the key "' + key + '".')
      setFrozen(branch)
      continue
    }

    adjacentNodes.push([ key, boundNode ])

    if (!parentNode.contains(boundNode))
      throw new Error('The bound DOM element must be either ' +
        'contained in or equal to the element in its parent binding.')

    if (branch[hasDefinitionKey]) {
      ensureNodes(scope, boundNode, branch[1])
      setFrozen(branch)
      continue
    }

    setReplaceAttribute(branch, boundNode)
    setFrozen(branch)
  }

  // Need to loop again to invalidate containment in adjacent nodes, after the
  // adjacent nodes are found.
  for (key in def) {
    boundNode = def[key][0]
    for (i = 0, j = adjacentNodes.length; i < j; i++)
      if (adjacentNodes[i][1].contains(boundNode) &&
        adjacentNodes[i][1] !== boundNode)
        throw new Error(
          'The element for key "' + key + '" is contained in the ' +
          'element for the adjacent key "' + adjacentNodes[i][0] + '".')
  }

  // Freeze the definition.
  setFrozen(def)
}


function setReplaceAttribute (branch, boundNode) {
  Object.defineProperty(branch, replaceAttributeKey, {
    value: ~replaceValue.indexOf(boundNode.nodeName) ?
      ~replaceChecked.indexOf(boundNode.type) ?
      'checked' : 'value' : 'textContent'
  })
}


function setFrozen (obj) {
  Object.defineProperty(obj, isProcessedKey, { value: true })
  Object.freeze(obj)
}

},{"./bind_keys":5,"./feature_check":6,"./helpers":7,"./key_map":9,"./process_nodes":10,"./rehydrate":11}],9:[function(require,module,exports){
'use strict'

var keys = [
  'hasDefinition',
  'isBoundToParent',
  'isProcessed',
  'replaceAttribute',
  'retainElement'
]

var keyMap = {}
var hasSymbol = typeof Symbol === 'function'
var i, j

for (i = 0, j = keys.length; i < j; i++)
  keyMap[keys[i]] = hasSymbol ?
    Symbol(keys[i]) : '__' + keys[i] + '__'

module.exports = keyMap

},{}],10:[function(require,module,exports){
'use strict'

var keyMap = require('./key_map')

var isBoundToParentKey = keyMap.isBoundToParent

// Map from definition branches to marker nodes. This is necessary because the
// definitions are frozen and cannot be written to.
var markerMap = processNodes.markerMap = new WeakMap()

// Option to use comment nodes as markers.
processNodes.useCommentNode = false


module.exports = processNodes


/**
 * Internal function to remove bound nodes and replace them with markers.
 *
 * @param {*} [scope]
 * @param {Node} node
 * @param {Object} def
 * @return {Node}
 */
function processNodes (scope, node, def) {
  var document = scope ? scope.document : window.document
  var key, branch, mirrorNode, parent, marker, map

  node = node.cloneNode(true)
  map = matchNodes(scope, node, def)

  for (key in def) {
    branch = def[key]
    if (branch[isBoundToParentKey]) continue

    mirrorNode = map.get(branch[0])
    parent = mirrorNode.parentNode

    if (processNodes.useCommentNode) {
      marker = parent.insertBefore(document.createComment(
          ' end "' + key + '" '), mirrorNode)
      parent.insertBefore(document.createComment(
        ' begin "' + key + '" '), marker)
    }
    else marker = parent.insertBefore(
      document.createTextNode(''), mirrorNode)

    markerMap.set(branch, marker)

    parent.removeChild(mirrorNode)
  }

  return node
}


/**
 * Internal function to find matching DOM nodes on cloned nodes.
 *
 * @param {*} [scope]
 * @param {Node} node
 * @param {Object} def
 * @return {WeakMap}
 */
function matchNodes (scope, node, def) {
  var document = scope ? scope.document : window.document
  var NodeFilter = scope ? scope.NodeFilter : window.NodeFilter
  var treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT)
  var map = new WeakMap()
  var nodes = []
  var i, j, key, currentNode

  for (key in def) nodes.push(def[key][0])

  while (treeWalker.nextNode() && nodes.length)
    for (i = 0, j = nodes.length; i < j; i++) {
      currentNode = nodes[i]
      if (treeWalker.currentNode.isEqualNode(currentNode)) {
        map.set(currentNode, treeWalker.currentNode)
        nodes.splice(i, 1)
        break
      }
    }

  return map
}

},{"./key_map":9}],11:[function(require,module,exports){
'use strict'

var processNodes = require('./process_nodes')
var bindKeys = require('./bind_keys')
var keyMap = require('./key_map')

var hasDefinitionKey = keyMap.hasDefinition
var isBoundToParentKey = keyMap.isBoundToParent
var markerMap = processNodes.markerMap
var storeMeta = bindKeys.storeMeta
var addToPath = bindKeys.addToPath
var findTarget = bindKeys.findTarget


module.exports = rehydrate


/**
 * Rehydration of existing DOM nodes by recursively checking equality.
 *
 * @param {*} scope
 * @param {Object} obj
 * @param {Object} def
 * @param {Node} node
 * @param {Node} matchNode
 */
function rehydrate (scope, obj, def, node, matchNode) {
  var document = scope ? scope.document : window.document
  var NodeFilter = scope ? scope.NodeFilter : window.NodeFilter

  var key, branch, x, value, change, definition, mount, keyPath, endPath
  var meta, valueIsArray, activeNodes, index, treeWalker, currentNode

  for (key in def) {
    branch = def[key]
    meta = storeMeta.get(obj)[key]
    change = !branch[hasDefinitionKey] && branch[1]
    definition = branch[hasDefinitionKey] && branch[1]
    mount = branch[2]
    keyPath = meta.keyPath

    if (branch[isBoundToParentKey]) {
      x = obj[key]

      if (definition && x != null)
        bindKeys(scope, x, definition, matchNode, keyPath)
      else if (change) change(matchNode, x, null, keyPath)

      continue
    }

    activeNodes = meta.activeNodes
    if (!activeNodes.length) continue

    valueIsArray = meta.valueIsArray
    x = valueIsArray ? obj[key] : [ obj[key] ]
    index = 0
    treeWalker = document.createTreeWalker(matchNode, NodeFilter.SHOW_ELEMENT)

    while (index < activeNodes.length && treeWalker.nextNode()) {
      currentNode = activeNodes[index]
      if (treeWalker.currentNode.isEqualNode(currentNode)) {
        activeNodes.splice(index, 1, treeWalker.currentNode)

        value = x[index]
        endPath = keyPath

        if (valueIsArray)
          endPath = addToPath(keyPath, keyPath, index)

        if (definition) {
          rehydrate(scope, value, definition,
            currentNode, treeWalker.currentNode)

          if (mount) {
            findTarget(endPath, keyPath)
            mount(treeWalker.currentNode, value, null, endPath)
          }
        }
        else if (change)
          change(treeWalker.currentNode, value, null, endPath)

        index++
      }
    }

    if (index !== activeNodes.length) throw new Error(
      'Matching nodes could not be found on key "' + key + '".')

    // Rehydrate marker node.
    currentNode = treeWalker.currentNode

    // Ignore comment node setting, comment may already exist.
    markerMap.set(branch, currentNode.parentNode.insertBefore(
      document.createTextNode(''), currentNode.nextSibling))
  }
}

},{"./bind_keys":5,"./key_map":9,"./process_nodes":10}]},{},[4]);
