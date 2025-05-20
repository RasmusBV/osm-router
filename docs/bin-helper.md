# BinHelper v1.1
Shout out: https://fadden.com/tech/file-formats.html.

Helper for serializing and deserializing simple binary files.

The main helper is a class called `Format`, which takes a *definition* and via 
that it is able to serialize and deserialize files.

A *Definition* looks like this:
```ts
type FormatDefinition = {
    signature: [number, number, number, number]     // 4 Byte file signature
    versions: {
        alignment: number,                          // Section byte alignment
        flags: string[]                             // 1 byte, maximum of 8 flags
    }
}   

type SectionDefinition = {
    name: string
    id: number                                      // (0x0000 - 0xFFFF)
    flags?: string[]                                // 1 byte, maximum of 8 flags
}
```
The format is split into two parts. One `FormatDefinition` which is for global definitions. 
If the flags or the alignment are to be changed, add a new version to the list of versions.

On top of that the definition includes any number of `SectionDefinitions`, which define all the types of sections that the file can contain.

After being constructed with these definitions, the `Format` can *serialize from* and *deserialize to* this format:

```ts
type Section = {
    buffer: DataView<ArrayBuffer>
    name: string,
    flags: Record<string, boolean>
}
```

# File Format
The *Header* and *Section Table* always use the big endian format.

## Header
The header of these files always follow this fixed layout:
```
Offset | Size | Field                  | Notes
----------------------------------------------------------------------------------------------------------
+00    | 4B   | Signature              |
+04    | 1B   | Format Version         |
+05    | 1B   | Data Version           |
+06    | 1B   | Padding                | Zero-fill
+07    | 1B   | Flags                  |
+08    | 8B   | ID                     |
+10    | 8B   | Timestamp              | 64bit signed int, Unix epoch timestamp in milliseconds
+18    | 20B  | Digest                 | SHA-1 digest of Header & Section Table with this field zeroed out
+2c    | 4B   | Section table size     | In bytes
```
Total Size: 48 Bytes

## Version

### Data version
User supplied value. Denotes changes in flags and alignment. All changes are breaking.

### Format version
Format version is the version of the format described in this file. All changes are breaking.


# Section Table
Located right after the header

For each section in the file:

```
Offset | Size | Field         | Notes
-------------------------------------------------------------------------
+00    | 8B   | Size          | In bytes (Not aligned)
+08    | 2B   | Section ID    |
+0a    | 1B   | Section Flags |
+0b    | 1B   | Padding       | Zero-fill
+0c    | 20B  | Digest        | SHA-1 digest of section
```
Total size: 32 Bytes


## Using the table
All data sections are padded to the alignment specified in the **Format Definition** and placed 
right after each other in the order specified in the table. To locate a specific section, start at `Header Size` + `Section table size` and sum up the size of all previous sections with any alignment padding according to the **Format Definition**.


## Changes in section definitions
Section definitions should never change, and if a section is to be modified, 
instead create a new section with a new section id, and bump the minor version.

### Example

A metadata field defined like this

---

**Metadata V1**

An XML document.

---

Is changed into 

---

**Metadata V2**

A JSON object encoded as a utf-8 string without BOM.

The root value must be an object {...}

---

This should be handled by creating a new metadata section with a seperate section ID.

The entire flow of handling older versions of `Format` that dont recognize the new **Metadata V2**,
should be done after deserializing, by user code.

# Change Log