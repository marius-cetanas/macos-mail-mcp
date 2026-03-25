set saveFolderPath to "{{savePath}}"
-- Read attachment name from temp file to avoid AppleScript string escaping issues
set targetAttName to do shell script "cat " & quoted form of "{{attNameFile}}"

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to (first message of theMailbox whose id is {{messageId}})

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is targetAttName then
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

        return "{\"success\": true, \"path\": \"" & my escapeForJson(fullSavePath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
