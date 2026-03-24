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

on escapeForJson(theString)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to ASCII number of c
        if c is "\\" then
            set resultStr to resultStr & "\\\\"
        else if c is "\"" then
            set resultStr to resultStr & "\\\""
        else if cCode is 10 then
            set resultStr to resultStr & "\\n"
        else if cCode is 13 then
            set resultStr to resultStr & "\\r"
        else if cCode is 9 then
            set resultStr to resultStr & "\\t"
        else
            set resultStr to resultStr & c
        end if
    end repeat
    return resultStr
end escapeForJson

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to first message of theMailbox whose id is {{messageId}}

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is "{{attachmentName}}" then
                set targetAttachment to att
                exit repeat
            end if
        end repeat

        if targetAttachment is missing value then
            return "{\"error\": \"Attachment not found: {{attachmentName}}\", \"errorNumber\": -1}"
        end if

        if downloaded of targetAttachment is false then
            return "{\"error\": \"Attachment is not yet downloaded. Open the message in Mail.app first.\", \"errorNumber\": -2}"
        end if

        set attName to name of targetAttachment as text
        set tempPath to (POSIX path of (path to temporary items)) & attName

        save targetAttachment in POSIX file tempPath
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell

-- Read the saved temp file as UTF-8 text using shell
try
    set attName to "{{attachmentName}}"
    set tempPath to (POSIX path of (path to temporary items)) & attName
    set fileContent to do shell script "cat " & quoted form of tempPath
    set escapedName to my escapeQuotes(attName)
    set escapedContent to my escapeForJson(fileContent)
    -- Clean up temp file
    do shell script "rm -f " & quoted form of tempPath
    return "{\"name\": \"" & escapedName & "\", \"content\": \"" & escapedContent & "\"}"
on error errMsg number errNum
    -- Attempt cleanup even on error
    try
        set attName to "{{attachmentName}}"
        set tempPath to (POSIX path of (path to temporary items)) & attName
        do shell script "rm -f " & quoted form of tempPath
    end try
    return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
end try
