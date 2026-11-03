set bodyContent to ""
if "{{bodyFile}}" is not "__NONE__" then
    set bodyContent to my readUtf8File("{{bodyFile}}")
end if

tell application "Mail"
    try
        set theMailbox to my resolveMailbox("{{accountName}}", "{{mailboxName}}")
        set msg to (first message of theMailbox whose id is {{messageId}})
        set fwdMsg to forward msg without opening window
        set originalText to content of fwdMsg as text
        set originalAttachments to count of attachments of content of fwdMsg
        tell fwdMsg
            if "{{sender}}" is not "__NONE__" then
                set sender to "{{sender}}"
            end if
            make new to recipient with properties {address:"{{to}}"}
            if bodyContent is not "" then
                make new paragraph at beginning of content with data (bodyContent & linefeed & linefeed)
            end if
        end tell
        my assertComposeReady(bodyContent, originalText, content of fwdMsg as text, originalAttachments, count of attachments of content of fwdMsg, count of recipients of fwdMsg)
        -- Read back before sending. With no explicit sender this reveals whether
        -- Mail inherited the account that received the original or fell back to
        -- the global default.
        set actualSender to ""
        try
            set rawSender to sender of fwdMsg
            if rawSender is not missing value then set actualSender to (rawSender as text)
        end try
        if not (send fwdMsg) then error "Mail did not accept the forward for sending."
        return "{\"success\": true, \"sender\": \"" & my escapeForJson(actualSender) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
    end try
end tell
