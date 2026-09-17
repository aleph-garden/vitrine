import 'katex/dist/katex.min.css'
import './style.css'
import { boot } from './main.ts'

void boot(document.getElementById('chrome')!, document.getElementById('root')!)
