on buildRecipientsJson(recipientList)
    using terms from application "Mail"
        set recipJson to ""
        repeat with r in recipientList
            set rName to ""
            set rawName to name of r
            if rawName is not missing value then set rName to my escapeForJson(rawName as text)
            set rAddr to my escapeForJson(address of r as text)
            if recipJson is not "" then set recipJson to recipJson & ", "
            set recipJson to recipJson & "{\"name\": \"" & rName & "\", \"address\": \"" & rAddr & "\"}"
        end repeat
        return "[" & recipJson & "]"
    end using terms from
end buildRecipientsJson

tell application "Mail"
    try
        set targetId to {{messageId}} as integer
        set theAccount to account "{{accountName}}"
        set foundMsg to missing value
        set foundMboxName to ""

        repeat with mb in every mailbox of theAccount
            try
                set msg to (first message of mb whose id is targetId)
                set foundMsg to msg
                set foundMboxName to name of mb
                exit repeat
            end try
        end repeat

        if foundMsg is missing value then
            return "{\"error\": \"Message with ID " & my integerForJson(targetId) & " not found in any mailbox of account {{accountName}}\", \"errorNumber\": -1}"
        end if

        set msg to foundMsg
        set msgId to id of msg
        set msgSubject to my escapeForJson(subject of msg as text)
        set msgSender to my escapeForJson(sender of msg as text)
        set msgDate to my dateToUtcIso(date received of msg)
        set msgRead to read status of msg
        set msgFlagged to flagged status of msg
        set msgFlagIndex to flag index of msg
        set msgHasAttach to (count of mail attachments of msg) > 0

        set msgBody to my escapeForJson(content of msg as text)
        set msgHeaders to my escapeForJson(all headers of msg as text)

        set toJson to my buildRecipientsJson(to recipients of msg)
        set ccJson to my buildRecipientsJson(cc recipients of msg)
        set bccJson to my buildRecipientsJson(bcc recipients of msg)

        set attachJson to ""
        repeat with att in mail attachments of msg
            set attName to my escapeForJson(name of att as text)
            set rawMime to missing value
            try
                set rawMime to MIME type of att
            on error
                set rawMime to missing value
            end try
            set attMime to my escapeForJson(my attachmentMimeType(name of att as text, rawMime))
            set attSize to file size of att
            if attSize is missing value then set attSize to 0
            set attDownloaded to downloaded of att
            if attachJson is not "" then set attachJson to attachJson & ", "
            set attachJson to attachJson & "{\"name\": \"" & attName & "\", \"mimeType\": \"" & attMime & "\", \"fileSize\": " & my integerForJson(attSize) & ", \"downloaded\": " & attDownloaded & "}"
        end repeat

        set mboxNameEsc to my escapeForJson(foundMboxName)
        set result to "{"
        set result to result & "\"id\": " & my integerForJson(msgId) & ", "
        set result to result & "\"mailboxName\": \"" & mboxNameEsc & "\", "
        set result to result & "\"subject\": \"" & msgSubject & "\", "
        set result to result & "\"sender\": \"" & msgSender & "\", "
        set result to result & "\"dateReceived\": \"" & msgDate & "\", "
        set result to result & "\"readStatus\": " & msgRead & ", "
        set result to result & "\"flagged\": " & msgFlagged & ", "
        set result to result & "\"flagIndex\": " & my integerForJson(msgFlagIndex) & ", "
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
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
