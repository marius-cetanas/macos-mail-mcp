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

on buildRecipientsJson(recipientList)
    set recipJson to ""
    repeat with r in recipientList
        set rName to my escapeQuotes(name of r as text)
        set rAddr to my escapeQuotes(address of r as text)
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
        set msgSubject to my escapeQuotes(subject of msg as text)
        set msgSender to my escapeQuotes(sender of msg as text)
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
            set attName to my escapeQuotes(name of att as text)
            set attMime to my escapeQuotes(MIME type of att as text)
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
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
