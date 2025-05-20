import { processNode } from "./preprocess/nodes.js"
import { processWay } from "./preprocess/ways.js"
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
    const graph = data
        .process("node", processNode)
        .process("way", processWay)
        .build(processTurn)
    const serialized = await graph.serialize()
    await fs.writeFile(outputFilePath, serialized.out)
    console.log("Done")
})()