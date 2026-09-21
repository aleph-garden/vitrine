import 'katex/dist/katex.min.css'
import '@aleph-garden/host-core/style.css'
import { boot } from '@aleph-garden/host-core'
import { podHost } from './host.ts'

void boot(podHost, document.getElementById('chrome')!, document.getElementById('root')!)
