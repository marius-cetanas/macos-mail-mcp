tell application "Mail"
    try
        set msg to (first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}})
        set mailbox of msg to mailbox "{{toMailbox}}" of account "{{accountName}}"
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
