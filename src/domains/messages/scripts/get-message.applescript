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
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        set cCode to id of c
        if cCode >= 0 and cCode <= 31 then
            set hexChars to "0123456789abcdef"
            set hi to (cCode div 16) + 1
            set lo to (cCode mod 16) + 1
            set resultStr to resultStr & "\\u00" & character hi of hexChars & character lo of hexChars
        else
            set resultStr to resultStr & c
        end if
    end repeat

    set AppleScript's text item delimiters to oldDelims
    return resultStr
end escapeForJson

on buildRecipientsJson(recipientList)
    set recipJson to ""
    repeat with r in recipientList
        set rName to my escapeForJson(name of r as text)
        set rAddr to my escapeForJson(address of r as text)
        if recipJson is not "" then set recipJson to recipJson & ", "
        set recipJson to recipJson & "{\"name\": \"" & rName & "\", \"address\": \"" & rAddr & "\"}"
    end repeat
    return "[" & recipJson & "]"
end buildRecipientsJson

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to message id {{messageId}} of theMailbox

        set msgId to id of msg
        set msgSubject to my escapeForJson(subject of msg as text)
        set msgSender to my escapeForJson(sender of msg as text)
        set msgDate to date received of msg as «class isot» as string
        set msgRead to read status of msg
        set msgFlagged to flagged status of msg
        set msgFlagIndex to flag index of msg
        set msgHasAttach to has attachment of msg

        set msgBody to my escapeForJson(content of msg as text)
        set msgHeaders to my escapeForJson(all headers of msg as text)

        set toJson to my buildRecipientsJson(to recipients of msg)
        set ccJson to my buildRecipientsJson(cc recipients of msg)
        set bccJson to my buildRecipientsJson(bcc recipients of msg)

        set attachJson to ""
        repeat with att in mail attachments of msg
            set attName to my escapeForJson(name of att as text)
            set attMime to my escapeForJson(MIME type of att as text)
            set attSize to file size of att
            if attSize is missing value then set attSize to 0
            set attDownloaded to downloaded of att
            if attachJson is not "" then set attachJson to attachJson & ", "
            set attachJson to attachJson & "{\"name\": \"" & attName & "\", \"mimeType\": \"" & attMime & "\", \"fileSize\": " & attSize & ", \"downloaded\": " & attDownloaded & "}"
        end repeat

        set result to "{"
        set result to result & "\"id\": " & msgId & ", "
        set result to result & "\"subject\": \"" & msgSubject & "\", "
        set result to result & "\"sender\": \"" & msgSender & "\", "
        set result to result & "\"dateReceived\": \"" & msgDate & "\", "
        set result to result & "\"readStatus\": " & msgRead & ", "
        set result to result & "\"flagged\": " & msgFlagged & ", "
        set result to result & "\"flagIndex\": " & msgFlagIndex & ", "
        set result to result & "\"hasAttachments\": " & msgHasAttach & ", "
        set result to result & "\"toRecipients\": " & toJson & ", "
        set result to result & "\"ccRecipients\": " & ccJson & ", "
        set result to result & "\"bccRecipients\": " & bccJson & ", "
        set result to result & "\"body\": \"" & msgBody & "\", "
        set result to result & "\"headers\": \"" & msgHeaders & "\", "
        set result to result & "\"attachments\": [" & attachJson & "]"
        set result to result & "}"
        return result
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
