-- Read body from temp file to preserve newlines
set bodyContent to do shell script "cat " & quoted form of "{{bodyFile}}"
set subjectText to "{{subject}}"

tell application "Mail"
    try
        set pathList to {}
        if "{{attachmentPathsFile}}" is not "__NONE__" then
            set pathList to my readAttachmentPaths("{{attachmentPathsFile}}", {{attachmentCount}})
        end if
        set newMsg to make new outgoing message with properties {content:bodyContent, subject:subjectText, visible:false}
        tell newMsg
            if "{{sender}}" is not "__NONE__" then
                set sender to "{{sender}}"
            end if
            make new to recipient with properties {address:"{{to}}"}
            if "{{cc}}" is not "__NONE__" then
                make new cc recipient with properties {address:"{{cc}}"}
            end if
            if "{{bcc}}" is not "__NONE__" then
                make new bcc recipient with properties {address:"{{bcc}}"}
            end if
        end tell
        if "{{attachmentPathsFile}}" is not "__NONE__" then
            tell content of newMsg
                repeat with attachPath in pathList
                    make new attachment with properties {file name:POSIX file (attachPath as text)} at after last paragraph
                    delay 1
                end repeat
            end tell
            my requireAttachmentCount(count of attachments of content of newMsg, {{attachmentCount}})
        end if
        -- Read the sender back before sending: when the caller passed no sender
        -- this reports the account Mail chose on its own, which is otherwise
        -- only discoverable by finding the message in Sent afterwards.
        set actualSender to ""
        try
            set rawSender to sender of newMsg
            if rawSender is not missing value then set actualSender to (rawSender as text)
        end try
        set didSend to send newMsg
        my requireSendAccepted(didSend)
        return "{\"success\": true, \"sender\": \"" & my escapeForJson(actualSender) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell

on readAttachmentPaths(pathsFile, expectedCount)
    -- Shell output converts LF to CR; paragraphs accepts either separator.
    set attachmentData to do shell script "cat " & quoted form of pathsFile
    set pathList to paragraphs of attachmentData
    my requireAttachmentCount(count of pathList, expectedCount)
    return pathList
end readAttachmentPaths

on requireAttachmentCount(actualCount, expectedCount)
    if (class of expectedCount) is not integer or expectedCount < 1 then
        error "Invalid expected attachment count; message not sent."
    end if
    if actualCount is not expectedCount then
        error "Attachment count mismatch: expected " & expectedCount & ", found " & actualCount & "; message not sent."
    end if
end requireAttachmentCount

on requireSendAccepted(didSend)
    if didSend is not true then
        error "Mail did not accept the message for sending."
    end if
end requireSendAccepted
