set saveSucceeded to false
set tempPath to ""
set tempDir to do shell script "mktemp -d"
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
            tell me to do shell script "rm -rf " & quoted form of tempDir
            return "{\"error\": \"Attachment not found\", \"errorNumber\": -1}"
        end if

        if downloaded of targetAttachment is false then
            tell me to do shell script "rm -rf " & quoted form of tempDir
            return "{\"error\": \"Attachment is not yet downloaded. Open the message in Mail.app first.\", \"errorNumber\": -2}"
        end if

        set attName to name of targetAttachment as text
        set tempPath to tempDir & "/" & attName
        save targetAttachment in POSIX file tempPath
        set saveSucceeded to true
    on error errMsg number errNum
        if tempDir is not "" then
            try
                tell me to do shell script "rm -rf " & quoted form of tempDir
            end try
        end if
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell

if saveSucceeded then
    try
        set fileContent to do shell script "cat " & quoted form of tempPath
        set escapedName to my escapeForJson(attName)
        set escapedContent to my escapeForJson(fileContent)
        do shell script "rm -rf " & quoted form of tempDir
        return "{\"name\": \"" & escapedName & "\", \"content\": \"" & escapedContent & "\"}"
    on error errMsg number errNum
        try
            do shell script "rm -rf " & quoted form of tempDir
        end try
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
else
    -- Fallthrough: should not be reached, but ensure cleanup
    do shell script "rm -rf " & quoted form of tempDir
    return "{\"error\": \"Unexpected state: attachment not saved\", \"errorNumber\": -99}"
end if
