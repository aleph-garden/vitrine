import '@aleph-garden/host-core/style.css'
import { boot } from '@aleph-garden/host-core'
import { gardenHost } from './host.ts'

void boot(gardenHost, document.getElementById('chrome')!, document.getElementById('root')!)
