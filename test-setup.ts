import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ url: 'https://pod.example/' })

// A browser answers `nodeName` from `Node.prototype` for every node; happy-dom
// answers '' there and overrides the getter on each subclass. Code that reads
// the prototype getter to stay realm-safe, DOMPurify among it, then sees an
// empty tag name for every element and strips the document clean. Route
// `Node.prototype`'s getter to the subclass that answers.
const nodeProto = Node.prototype
const base = Object.getOwnPropertyDescriptor(nodeProto, 'nodeName')
Object.defineProperty(nodeProto, 'nodeName', {
  configurable: true,
  get(this: Node) {
    for (let p = Object.getPrototypeOf(this); p && p !== nodeProto; p = Object.getPrototypeOf(p)) {
      const own = Object.getOwnPropertyDescriptor(p, 'nodeName')
      if (own?.get) return own.get.call(this)
    }
    return base?.get?.call(this) ?? ''
  }
})
