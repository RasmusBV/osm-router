# OSM Graph file format v1.1
File format is built on top of the `bin-helper` scaffold which is documented in `bin-helper.md`

# Header

Signature: `0x9c 0x9c 0x44 0x47`
Alignment: 8

## Flags

### Endianness

Determines the endianness in all instances referenced in the data sections.

**True** Big Endian

**False** Little Endian

### Index Sizes

Determines the size of the indexes used throughout the file

**True** 64bit

**False** 32bit

# Data Sections
```
Name             | Section ID | Has Flags
-----------------------------------------
Metadata         | 0x0001     |
Nodes            | 0x0002     | x
Edges            | 0x0003     | 
Edge List        | 0x0004     | 
Node List        | 0x0005     | 
Connections List | 0x0006     | 
Index            | 0x0007     | x
```

There is no versioning for this file format, if changes are desired, add new data sections.
This includes if an existing data sections is to be modified. Instead create a new data section,
with the modifications.

## Metadata
A JSON object encoded as a utf-8 string without BOM.

The root value must be an object {...}

All values are optional, but if keys from the vocabulary are used, 
they must conform to the vocabulary.

### Metadata Key Vocabulary
```
Key            | Type                                                       | Notes
-----------------------------------------------------------------------------------
bbox           | [west: number, south: number, east: number, north: number] | WGS84
notes          | string                                                     |
writingprogram | string                                                     |
```

## Nodes (Array)
All nodes that are terminal nodes in the graph come first in the list, followed by the rest of the nodes.

Each entry is always padded to the nearest 8-byte boundary

The coordinate system for the Lon and Lat is WGS84

```
Size    | Field            | Notes
-------------------------------------------------------
8B      | Node OSM-ID      | 64bit uint
4B / 8B | Lon              | Float per section flag "Coordinate Precision"
4B / 8B | Lat              | Float per section flag "Coordinate Precision"
4B / 8B | Edge list index  | Per global flag "Index Size"
2B      | Edge list length |
2B / 6B | Padding          | Zero-fill
```

### Section Flags

### Coordinate Precision

Determines the format for the *Lon* and *Lat* fields

**True** IEEE 754: binary64 (double precision)

**False** IEEE 754: binary32 (single precision)


## Edges (Array)
Each entry is always padded to the nearest 8-byte boundary
The *In edge list* and *Out edge list* both refer to the Connections List, just with one set being edges that **connect to this edge**, and the other being edges that **this edge connects to**.

```
Size    | Name                 | Notes
-------------------------------------------------------
2B      | Node list length     |
2B      | Out edge list length |
2B      | In edge list length  |
2B      | Padding              | Zero-fill
4B / 8B | Node list index      | Per global flag "Index Size"
4B / 8B | Out edge list index  |
4B / 8B | In edge list index   |
0B / 4B | Padding              | Zero-fill
```


## Edge List (Array)
An array of either 8 byte or 4 byte Edge indexes (Per global flag *Index Sizes*)


## Node List (Array)
An array of either 8 byte or 4 byte Node indexes (Per global flag *Index Sizes*)


## Connections List (Array)
Each entry is always padded to the nearest 8-byte boundary
```
Size    | Name       | Notes
-------------------------------------------------------
4B / 8B | Edge index | Per global flag "Index Sizes"
4B      | Cost       | Float32
0B / 4B | Padding    | Zero-fill
```

## Index
This engine uses KDBush by https://github.com/mourner which is backed by an ArrayBuffer, which is what gets serialized into this section. For more information about it see https://github.com/mourner/kdbush.

Nodes are inserted into the index in the same order as they are in the nodes section. When doing a query, the corresponding node can be found in the nodes section by the returned index.


### Section Flags

### Index Type

**True:** All nodes are indexed

**False:** Only terminal nodes are indexed

# Change Log
