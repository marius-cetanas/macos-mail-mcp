tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to my requireMessage(theMailbox, {{messageId}}, "{{accountName}}", "{{mailboxName}}")
        set flagged status of msg to {{flagged}}
        if {{flagIndex}} is not -1 then
            set flag index of msg to {{flagIndex}}
        end if
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
