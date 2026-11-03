on findMessageInMailbox(theMailbox, targetId)
    set targetId to contents of targetId
    my integerForJson(targetId)
    tell application "Mail"
        try
            set foundMessage to (first message of theMailbox whose id is targetId)
            get id of foundMessage
            return foundMessage
        on error errMsg number errNum
            if errNum is -1719 or errNum is -1728 then return missing value
            error errMsg number errNum
        end try
    end tell
end findMessageInMailbox

on messageNotFoundText(targetId, requestedAccount, requestedMailbox)
    set errorText to "Message " & my integerForJson(targetId) & " not found in account \"" & requestedAccount & "\""
    if requestedMailbox is missing value then return errorText & " (searched all mailboxes)."
    return errorText & ", mailbox \"" & requestedMailbox & "\"."
end messageNotFoundText

on requireMessage(theMailbox, targetId, requestedAccount, requestedMailbox)
    set foundMessage to my findMessageInMailbox(theMailbox, targetId)
    if foundMessage is missing value then error (my messageNotFoundText(targetId, requestedAccount, requestedMailbox)) number -1728
    return foundMessage
end requireMessage
