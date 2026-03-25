tell application "Mail"
    try
        set msg to (first message of mailbox "{{mailboxName}}" of account "{{accountName}}" whose id is {{messageId}})
        set flagged status of msg to {{flagged}}
        if {{flagIndex}} is not -1 then
            set flag index of msg to {{flagIndex}}
        end if
        return "{\"success\": true}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
