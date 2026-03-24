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

set saveFolderPath to do shell script "echo " & quoted form of "{{savePath}}"

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is "{{attachmentName}}" then
                set targetAttachment to att
                exit repeat
            end if
        end repeat

        if targetAttachment is missing value then
            return "{\"error\": \"Attachment not found\", \"errorNumber\": -1}"
        end if

        if downloaded of targetAttachment is false then
            return "{\"error\": \"Attachment is not yet downloaded. Open the message in Mail.app first.\", \"errorNumber\": -2}"
        end if
        set fullSavePath to saveFolderPath & "/" & name of targetAttachment

        save targetAttachment in POSIX file fullSavePath

        return "{\"success\": true, \"path\": \"" & my escapeQuotes(fullSavePath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
