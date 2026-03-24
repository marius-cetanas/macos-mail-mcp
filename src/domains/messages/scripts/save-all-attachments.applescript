on escapeQuotes(theString)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        if c is "\"" then
            set resultStr to resultStr & "\\\""
        else if c is "\\" then
            set resultStr to resultStr & "\\\\"
        else
            set resultStr to resultStr & c
        end if
    end repeat
    return resultStr
end escapeQuotes

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox

        set saveFolderPath to do shell script "echo " & quoted form of "{{savePath}}"
        set savedFilesJson to ""
        set savedCount to 0

        repeat with att in mail attachments of msg
            if downloaded of att is true then
                set attName to name of att as text
                set fullSavePath to saveFolderPath & "/" & attName
                save att in POSIX file fullSavePath
                set escapedPath to my escapeQuotes(fullSavePath)
                if savedFilesJson is not "" then set savedFilesJson to savedFilesJson & ", "
                set savedFilesJson to savedFilesJson & "\"" & escapedPath & "\""
                set savedCount to savedCount + 1
            end if
        end repeat

        return "{\"success\": true, \"savedFiles\": [" & savedFilesJson & "], \"savePath\": \"" & my escapeQuotes(saveFolderPath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
