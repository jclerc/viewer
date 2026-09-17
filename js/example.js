import Card from './Card'
import {z, a} from 'react'
import fs from 'fs'

const name="world"
const greet=(excited=false)=>`hello ${name}${excited?'!':''}`
const doubled=(n)=>n*2
function App({title="demo"}={}){
const items=[1,2,3]
const [first,...rest]=items
return <div className="demo">{title}<span>{greet(true)}</span>{rest.map((n)=><span key={n}>{n}</span>)}</div>
}
const Demo={
items:[1,2,3],
greet:()=>greet(true)
}
export default function main(){
const {items,greet:say}=Demo
const extra=[...items,4]
const d={...Demo,count:extra.length}
const load=async()=>await Promise.resolve(name)
console.log(d.greet?.()??say())
for(const n of extra) console.log(`${n} -> ${doubled(n)}`)
if(name) greet()
load()
}
