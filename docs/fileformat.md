# OSM Graph file format v1.1
Shout out: https://fadden.com/tech/file-formats.html

# General file structure
```
Header
-------------
Section Table
-------------
Data Section
```

# Header
```
Offset | Size | Field                  | Notes
-----------------------------------------------------------------------------------------------
+00    | 4B   | Signature: 9c 9c 44 47 | Ascii: \9c \9c D G 
+04    | 1B   | Major Version          | Currently 1
+05    | 1B   | Minor Version          | Currently 1
+05    | 1B   | Padding                | Zero-fill
+07    | 1B   | Flags                  |
+08    | 8B   | Graph ID               |
+10    | 8B   | Timestamp              | 64bit signed int, Unix epoch timestamp in milliseconds
+18    | 20B  | Digest                 | SHA-1 digest of Header & Section Table with this field zeroed out
+2c    | 4B   | Section table size     | In bytes
```
Total Size: 48 Bytes

## Version
Major versions denote breaking changes, and parsers should make no assumption
on being able to parse files outside their known major versions.

Minor versions denote non-breaking changes, such as new data sections, which can
safely be ignored by older parsers.

## Flags

```
|  Endianness  |  Index Sizes  | ... 6 reserved bits (zero-fill) ...  |
```

### Endianness

**True** Big Endian

**False** Little Endian

### Index Sizes

Determines the size of the indexes used throughout the file

**True** 64bit

**False** 32bit

## Graph ID
The Graph ID is a random 64bit number.

The index of any particular node or edge is not deterministic, and as such,
any data associated with their index is associated with only a specific graph file, 
which can be uniquely identified with the Graph ID.

## Reserved bits
These may be made functional in **Minor Versions** if they can be ignored, and as such should always be ignored.

# Section Table
Located right after the header

For each section in the file:

```
Offset | Size | Field         | Notes
-------------------------------------------------------------------------
+00    | 8B   | Size          | In bytes
+08    | 2B   | Section ID    |
+0a    | 1B   | Section Flags | See each section
+0b    | 1B   | Padding       | Zero-fill
+0c    | 20B  | Digest        | SHA-1 digest of section
```
Total size: 32 Bytes

Current list of sections, with their associated IDs.
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

## Using the table
All data sections are padded to the nearest 8-byte boundary and placed 
right after each other, in the order specified in the table.
To locate a specific section, start at *Header Size* + *Section table size* 
and sum up the size of all previous sections.

# Data Sections

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

```
|  Coordinate Precision  | ... 7 reserved bits (zero-fill) ...  |
```

### Coordinate Precision

Determines the format for the *Lon* and *Lat* fields

**True** IEEE 754: binary64 (double precision)

**False** IEEE 754: binary32 (single precision)


## Edges (Array)
```
Size    | Name                    | Notes
-------------------------------------------------------
4B      | Cost                    | Float32
2B      | Node list length        |
2B      | Connections list length |
4B / 8B | Node list index         | Per global flag "Index Size"
4B / 8B | Connections list index  |
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
see https://github.com/mourner/kdbush

Nodes are inserted into the index in the same order as they are in the nodes section. When doing a query, the corresponding node can be found in the nodes section by the returned index.


### Section Flags

```
|  Index Type  | ... 7 reserved bits (zero-fill) ...  |
```

### Index Type

**True:** All nodes are indexed

**False:** Only terminal nodes are indexed
