import { processNode } from "./preprocess/nodes.js"
import * as wayProcessors from "./preprocess/ways.js"
import { processTurn } from "./preprocess/turns.js"
import { OSMData } from "../index.js"
import * as fs from "fs/promises"

;(async() => {
    const outputFilePath = process.argv[2]
    const inputFilePath = process.argv[3]
    
    if(!inputFilePath || !outputFilePath) {
        throw new Error("Please provide input and output file paths")
    }
    const data = new OSMData({
        filter: (element) => {
            if(element.type !== "way") { 
                return true 
            }
            const highway = element.tags?.highway
            return highway !== undefined && highway !== ""
        }
    })
    data.on("warning", (warn) => {
        console.warn(warn.toString())
    })
    data.on("info", (info) => {
        console.log(info.toString())
    })
    await data.read(inputFilePath)

    // It may be ugly
    // but it makes handling custom data a lot smoother.
    const graph = data.process("node", processNode)
        .process("way", wayProcessors.blocked)
        .process("way", wayProcessors.avoid)
        .process("way", wayProcessors.restricted)       // <--- This preprocessing step adds some custom info.
        .process("way", wayProcessors.oneway)
        .process("way", wayProcessors.alternateOptions)
        .process("way", wayProcessors.service)
        .process("way", wayProcessors.speed)
        .process("way", wayProcessors.maxspeed)
        .process("way", wayProcessors.surface)
        .process("way", wayProcessors.penalties)
        .build(processTurn)                             // <--- Which is consumed down here while still being typed.
    
    const serialized = await graph.serialize()
    await fs.writeFile(outputFilePath, serialized.out)
    console.log("Done")
})()