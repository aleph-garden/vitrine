// The shell's own controls, outside the region and on every host: what is on
// show, the field that opens an IRI, and login. Session belongs to the host,
// so no view ever renders these, and credentials are typed at the issuer.

import { AS } from '@aleph-garden/view'
import type { Runtime } from '@aleph-garden/view/dom'
import { addressOf } from './address.ts'
import { issuerOf, type Session } from './main.ts'

/** Renders into `host`: the origin and IRI of the resource on show (kept
 *  current from the runtime's instances, mirrored into document.title),
 *  the IRI field, which dispatches an as:View through the runtime, and
 *  the login control. Login goes to `issuer` when given, else asks for a
 *  WebID and resolves it through issuerOf. `credentialed` says whether the
 *  session reaches an origin; next to the WebID the chrome marks the resource
 *  on show anonymous while it does not. */
export function installChrome(
  host: Element,
  session: Session,
  issuer: string | undefined,
  runtime: Runtime,
  credentialed: (origin: string) => boolean
): void {
  const origin = element('span', 'origin')
  const iri = element('span', 'iri')
  const showing = element('span', 'showing')
  showing.append(origin, ' ', iri)

  const login = loginControl(session, issuer)
  const anonymous = element('span', 'anonymous')
  anonymous.textContent = 'anonymous here'
  host.replaceChildren(showing, openForm(runtime), login)

  const show = () => {
    const address = addressOf(location.href)
    origin.textContent = new URL(address.iri).hostname
    iri.textContent = address.iri
    document.title = `${address.iri} · Aleph Garden`
    // A visitor without a session is anonymous everywhere, which the login
    // control already says.
    if (session.webId !== undefined && !credentialed(new URL(address.iri).origin)) {
      login.after(anonymous)
    } else {
      anonymous.remove()
    }
  }
  show()
  // Navigation has updated the location by the time a host listener runs,
  // so both sources read the resource the region is about to hold.
  runtime.listen((event) => {
    if (event.type === AS.View) show()
  })
  window.addEventListener('popstate', show)
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

function loginControl(session: Session, issuer: string | undefined): Element {
  if (session.webId !== undefined) {
    const webId = element('span', 'webid')
    webId.textContent = session.webId
    return webId
  }
  if (issuer !== undefined) {
    const button = element('button', 'login')
    button.type = 'button'
    button.textContent = 'Log in'
    button.addEventListener('click', () => void session.login(issuer))
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
    await session.login(await issuerOf(session.fetch, webId))
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
