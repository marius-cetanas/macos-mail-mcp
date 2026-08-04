set bodyContent to ""
if "{{bodyFile}}" is not "__NONE__" then
    set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
end if

tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to (first message of theMailbox whose id is {{messageId}})
        if "{{replyAll}}" is "true" then
            set replyMsg to reply msg reply to all yes without opening window
        else
            set replyMsg to reply msg without opening window
        end if
        tell replyMsg
            if "{{sender}}" is not "__NONE__" then
                set sender to "{{sender}}"
            end if
            if bodyContent is not "" then
                set content to bodyContent & (ASCII character 10) & (ASCII character 10) & content
            end if
        end tell
        -- Read back before sending. With no explicit sender this reveals whether
        -- Mail inherited the account that received the original or fell back to
        -- the global default.
        set actualSender to ""
        try
            set rawSender to sender of replyMsg
            if rawSender is not missing value then set actualSender to (rawSender as text)
        end try
        send replyMsg
        return "{\"success\": true, \"sender\": \"" & my escapeForJson(actualSender) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
