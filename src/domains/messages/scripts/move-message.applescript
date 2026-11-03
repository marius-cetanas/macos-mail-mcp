tell application "Mail"
    try
        set srcMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to my requireMessage(srcMailbox, {{messageId}}, "{{accountName}}", "{{mailboxName}}")
        set mailbox of msg to (my resolveMailbox("{{accountName}}", "{{toMailbox}}"))
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
