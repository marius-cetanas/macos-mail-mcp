-- Native UTF-8 reading preserves line endings and trailing newlines.
on readUtf8File(filePath)
    set sourceFile to POSIX file filePath
    set byteCount to get eof sourceFile
    if byteCount is 0 then return ""

    set fileContent to read sourceFile as «class utf8»
    -- The native decoder removes a leading UTF-8 BOM; retain it as U+FEFF.
    if byteCount ≥ 3 then
        if (read sourceFile from 1 for 3 as data) is «data rdatEFBBBF» then
            set fileContent to (character id 65279) & fileContent
        end if
    end if
    return fileContent
end readUtf8File
