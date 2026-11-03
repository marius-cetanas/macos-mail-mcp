set bodyContent to ""
if "{{bodyFile}}" is not "__NONE__" then
    set bodyContent to my readUtf8File("{{bodyFile}}")
end if

tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to my requireMessage(theMailbox, {{messageId}}, "{{accountName}}", "{{mailboxName}}")
        if "{{replyAll}}" is "true" then
            set replyMsg to reply msg reply to all yes without opening window
        else
            set replyMsg to reply msg without opening window
        end if
        set originalText to content of replyMsg as text
        set originalAttachments to count of attachments of content of replyMsg
        tell replyMsg
            if "{{sender}}" is not "__NONE__" then
                set sender to "{{sender}}"
            end if
            if bodyContent is not "" then
                make new paragraph at beginning of content with data (bodyContent & linefeed & linefeed)
            end if
        end tell
        my assertComposeReady(bodyContent, originalText, content of replyMsg as text, originalAttachments, count of attachments of content of replyMsg, count of recipients of replyMsg)
        -- Read back before sending. With no explicit sender this reveals whether
        -- Mail inherited the account that received the original or fell back to
        -- the global default.
        set actualSender to ""
        try
            set rawSender to sender of replyMsg
            if rawSender is not missing value then set actualSender to (rawSender as text)
        end try
        if not (send replyMsg) then error "Mail did not accept the reply for sending."
        return "{\"success\": true, \"sender\": \"" & my escapeForJson(actualSender) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
