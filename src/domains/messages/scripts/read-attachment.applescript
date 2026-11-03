set saveSucceeded to false
set tempPath to ""
set tempDir to ""
-- Read attachment name from temp file to avoid AppleScript string escaping issues
set targetAttName to my readUtf8File("{{attNameFile}}")

tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to my requireMessage(theMailbox, {{messageId}}, "{{accountName}}", "{{mailboxName}}")

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is targetAttName then
                set targetAttachment to att
                exit repeat
            end if
        end repeat

        if targetAttachment is missing value then
            error "Attachment not found" number -1
        end if

        if downloaded of targetAttachment is false then
            error "Attachment is not yet downloaded. Open the message in Mail.app first." number -2
        end if

        set attName to name of targetAttachment as text
        set rawMime to missing value
        try
            set rawMime to MIME type of targetAttachment
        on error
            set rawMime to missing value
        end try
        set attMime to my attachmentMimeType(attName, rawMime)
        my requireReadableAttachment(attName, attMime)
        tell me to set tempDir to do shell script "mktemp -d"
        set tempPath to tempDir & "/" & attName
        save targetAttachment in POSIX file tempPath
        set saveSucceeded to true
    on error errMsg number errNum
        if tempDir is not "" then
            try
                tell me to do shell script "rm -rf " & quoted form of tempDir
            end try
        end if
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell

if saveSucceeded then
    try
        set fileContent to my readUtf8File(tempPath)
        set escapedName to my escapeForJson(attName)
        set escapedContent to my escapeForJson(fileContent)
        do shell script "rm -rf " & quoted form of tempDir
        return "{\"name\": \"" & escapedName & "\", \"content\": \"" & escapedContent & "\"}"
    on error errMsg number errNum
        try
            do shell script "rm -rf " & quoted form of tempDir
        end try
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
else
    -- Fallthrough: should not be reached, but ensure cleanup
    do shell script "rm -rf " & quoted form of tempDir
    return "{\"error\": \"Unexpected state: attachment not saved\", \"errorNumber\": -99}"
end if
