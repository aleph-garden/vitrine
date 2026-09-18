// The shell's own controls, outside the region and on every host. The frame's
// top left keeps what a browser keeps in view: the brand mark and the host
// name of the resource on show, with a dot for whether the session reaches it.
// The mark opens a panel with the rest: the IRI on show, the field that opens
// an IRI, and login. Session belongs to the host, so no view ever renders
// these, and credentials are typed at the issuer.

import { AS } from '@aleph-garden/view'
import type { Runtime } from '@aleph-garden/view/dom'
import { addressOf } from './address.ts'
import { issuerOf, type Session } from './main.ts'

/** Renders into the top left corner of `host`, which is the frame carrying
 *  the four `.corner` elements. Closed, the corner holds the icon, the host
 *  name of the resource on show, and the dot, which a host whose session has
 *  neither a WebID nor a login leaves out. `credentialed` says whether the
 *  session reaches an origin, which is the dot's `reaches` state. The icon
 *  opens the panel below it, and a second click or `Escape` closes it: the
 *  IRI on show, the IRI field, which dispatches an as:View through the
 *  runtime, and the login control, which a session with a login has. Login
 *  goes to `issuer` when given, else asks for a WebID and resolves it through
 *  issuerOf. The IRI on show is mirrored into document.title. */
export function installChrome(
  host: Element,
  session: Session,
  issuer: string | undefined,
  runtime: Runtime,
  credentialed: (origin: string) => boolean
): void {
  const corner = host.querySelector('.corner.top-left')!
  const icon = brandMark()
  const hostName = element('span', 'host')
  const dot = element('span', 'dot')
  // A session with neither is no session at all: the visitor is anonymous
  // everywhere and the dot would say the same thing on every host.
  const hasSession = session.login !== undefined || session.webId !== undefined
  corner.replaceChildren(icon, hostName, ...(hasSession ? [dot] : []))

  const iri = element('span', 'iri')
  const panel = element('div', 'panel')
  const login = loginControl(session, issuer)
  panel.append(iri, openForm(runtime), ...(login ? [login] : []))

  const close = () => {
    panel.remove()
    icon.setAttribute('aria-expanded', 'false')
  }
  icon.addEventListener('click', () => {
    if (panel.isConnected) return close()
    corner.append(panel)
    icon.setAttribute('aria-expanded', 'true')
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
  })

  const show = () => {
    const address = addressOf(location.href)
    const url = new URL(address.iri)
    hostName.textContent = url.hostname
    iri.textContent = address.iri
    dot.dataset.state = credentialed(url.origin) ? 'reaches' : 'anonymous'
    document.title = `${address.iri} · Aleph Garden`
  }
  show()
  // Navigation has updated the location by the time a host listener runs,
  // so both sources read the resource the region is about to hold.
  runtime.listen((event) => {
    if (event.type === AS.View) show()
  })
  window.addEventListener('popstate', show)
}

/** The brand mark as the button that opens the panel. The image carries no
 *  alternative text: the button is labelled. */
function brandMark(): HTMLButtonElement {
  const button = element('button', 'icon')
  button.type = 'button'
  button.setAttribute('aria-label', 'Aleph Garden')
  button.setAttribute('aria-expanded', 'false')
  const mark = document.createElement('img')
  mark.src = '/aleph.svg'
  mark.alt = ''
  button.append(mark)
  return button
}

function openForm(runtime: Runtime): HTMLFormElement {
  const form = element('form', 'open')
  const input = urlInput('iri', 'Open an IRI')
  form.append(input, submitButton('Open'))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void runtime.dispatch({ type: AS.View, object: input.value })
  })
  return form
}

/** Nothing on a host whose session has no login: the visitor stays anonymous
 *  there and has nowhere to log in. */
function loginControl(session: Session, issuer: string | undefined): Element | undefined {
  if (session.webId !== undefined) {
    const webId = element('span', 'webid')
    webId.textContent = session.webId
    return webId
  }
  if (session.login === undefined) return undefined
  if (issuer !== undefined) {
    const button = element('button', 'login')
    button.type = 'button'
    button.textContent = 'Log in'
    button.addEventListener('click', () => void session.login?.(issuer))
    return button
  }
  const form = element('form', 'login')
  const input = urlInput('webid', 'Your WebID')
  form.append(input, submitButton('Log in'))
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void loginAs(form, session, input.value)
  })
  return form
}

/** The issuer of the WebID's own choosing, then the redirect there. What
 *  goes wrong on the way is the visitor's to read, so it stays in the form. */
async function loginAs(form: HTMLFormElement, session: Session, webId: string): Promise<void> {
  form.querySelector('.error')?.remove()
  try {
    await session.login?.(await issuerOf(session.fetch, webId))
  } catch (e) {
    const error = element('p', 'error')
    error.textContent = e instanceof Error ? e.message : String(e)
    form.append(error)
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  el.className = className
  return el
}

function urlInput(name: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'url'
  input.name = name
  input.required = true
  input.placeholder = placeholder
  return input
}

function submitButton(label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'submit'
  button.textContent = label
  return button
}
