on escapeForJson(theString)
    -- Use text item delimiters for O(n) performance instead of character-by-character O(n²)
    set oldDelims to AppleScript's text item delimiters

    -- Escape backslashes first
    set AppleScript's text item delimiters to "\\"
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\\"
    set theString to parts as text

    -- Escape double quotes
    set AppleScript's text item delimiters to "\""
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\\""
    set theString to parts as text

    -- Escape tabs (ASCII 9)
    set AppleScript's text item delimiters to (ASCII character 9)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\t"
    set theString to parts as text

    -- Escape newlines (ASCII 10)
    set AppleScript's text item delimiters to (ASCII character 10)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\n"
    set theString to parts as text

    -- Escape carriage returns (ASCII 13)
    set AppleScript's text item delimiters to (ASCII character 13)
    set parts to text items of theString
    set AppleScript's text item delimiters to "\\r"
    set theString to parts as text

    -- Escape other C0 control characters (0-8, 11-12, 14-31)
    set resultList to {}
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to id of c
        if cCode >= 0 and cCode <= 31 then
            set hexChars to "0123456789abcdef"
            set hi to (cCode div 16) + 1
            set lo to (cCode mod 16) + 1
            copy ("\\u00" & character hi of hexChars & character lo of hexChars) to end of resultList
        else
            copy c to end of resultList
        end if
    end repeat

    set AppleScript's text item delimiters to ""
    set resultStr to resultList as text
    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson

set saveFolderPath to "{{savePath}}"

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to (first message of theMailbox whose id is {{messageId}})
        set savedFilesJson to ""
        set savedCount to 0

        set usedNames to {}
        repeat with att in mail attachments of msg
            if downloaded of att is true then
                set attName to name of att as text
                -- Deduplicate: if name already used, append (n) before extension
                if usedNames contains attName then
                    set dotOffset to -1
                    repeat with ci from (length of attName) to 1 by -1
                        if character ci of attName is "." then
                            set dotOffset to ci
                            exit repeat
                        end if
                    end repeat
                    set seqNum to 2
                    if dotOffset > 0 then
                        set baseName to text 1 thru (dotOffset - 1) of attName
                        set extPart to text dotOffset thru -1 of attName
                    else
                        set baseName to attName
                        set extPart to ""
                    end if
                    set candidateName to baseName & " (" & seqNum & ")" & extPart
                    repeat while usedNames contains candidateName
                        set seqNum to seqNum + 1
                        set candidateName to baseName & " (" & seqNum & ")" & extPart
                    end repeat
                    set attName to candidateName
                end if
                copy attName to end of usedNames
                set fullSavePath to saveFolderPath & "/" & attName
                save att in POSIX file fullSavePath
                set escapedPath to my escapeForJson(fullSavePath)
                if savedFilesJson is not "" then set savedFilesJson to savedFilesJson & ", "
                set savedFilesJson to savedFilesJson & "\"" & escapedPath & "\""
                set savedCount to savedCount + 1
            end if
        end repeat

        return "{\"success\": true, \"savedFiles\": [" & savedFilesJson & "], \"savePath\": \"" & my escapeForJson(saveFolderPath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
