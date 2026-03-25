on searchInMailbox(theMailbox, theField, theQuery, remainingLimit, seenIds)
    using terms from application "Mail"
        set resultList to ""
        set matchCount to 0
        set newSeenIds to seenIds
        if theField is "subject" then
            set matchedMessages to (messages of theMailbox whose subject contains theQuery)
        else if theField is "sender" then
            set matchedMessages to (messages of theMailbox whose sender contains theQuery)
        else
            set matchedMessages to (messages of theMailbox whose content contains theQuery)
        end if
        repeat with msg in matchedMessages
            if matchCount >= remainingLimit then exit repeat
            set msgId to id of msg
            -- Skip duplicate messages (Gmail labels can cause same message in multiple mailboxes)
            set idStr to msgId as text
            if idStr is in seenIds then
            else
            set msgSubject to my escapeForJson(subject of msg as text)
            set msgSender to my escapeForJson(sender of msg as text)
            set msgDate to date received of msg as «class isot» as string
            set msgRead to read status of msg
            set msgFlagged to flagged status of msg
            set msgFlagIndex to flag index of msg
            set attList to mail attachments of msg
            set msgHasAttach to (count of attList) > 0
            if resultList is not "" then set resultList to resultList & ", "
            set resultList to resultList & "{"
            set resultList to resultList & "\"id\": " & msgId & ", "
            set resultList to resultList & "\"subject\": \"" & msgSubject & "\", "
            set resultList to resultList & "\"sender\": \"" & msgSender & "\", "
            set resultList to resultList & "\"dateReceived\": \"" & msgDate & "\", "
            set resultList to resultList & "\"readStatus\": " & msgRead & ", "
            set resultList to resultList & "\"flagged\": " & msgFlagged & ", "
            set resultList to resultList & "\"flagIndex\": " & msgFlagIndex & ", "
            set resultList to resultList & "\"hasAttachments\": " & msgHasAttach
            set resultList to resultList & "}"
            set matchCount to matchCount + 1
            set end of newSeenIds to idStr
            end if
        end repeat
        return {resultList, matchCount, newSeenIds}
    end using terms from
end searchInMailbox

tell application "Mail"
    try
        set theField to "{{field}}"
        set theQuery to "{{query}}"
        set theMailboxName to "{{mailboxName}}"
        set theAccountName to "{{accountName}}"
        set limitNum to {{limit}} as integer

        set resultList to ""
        set totalFound to 0
        set seenIds to {}

        if theAccountName is "__ALL__" then
            repeat with acct in every account
                if totalFound >= limitNum then exit repeat
                if theMailboxName is "__ALL__" then
                    repeat with mb in every mailbox of acct
                        if totalFound >= limitNum then exit repeat
                        set {partial, partialCount, seenIds} to my searchInMailbox(mb, theField, theQuery, limitNum - totalFound, seenIds)
                        if partial is not "" then
                            if resultList is not "" then set resultList to resultList & ", "
                            set resultList to resultList & partial
                        end if
                        set totalFound to totalFound + partialCount
                    end repeat
                else
                    try
                        set mb to mailbox theMailboxName of acct
                        set {partial, partialCount, seenIds} to my searchInMailbox(mb, theField, theQuery, limitNum - totalFound, seenIds)
                        if partial is not "" then
                            if resultList is not "" then set resultList to resultList & ", "
                            set resultList to resultList & partial
                        end if
                        set totalFound to totalFound + partialCount
                    end try
                end if
            end repeat
        else
            set theAccount to account theAccountName
            if theMailboxName is "__ALL__" then
                repeat with mb in every mailbox of theAccount
                    if totalFound >= limitNum then exit repeat
                    set {partial, partialCount, seenIds} to my searchInMailbox(mb, theField, theQuery, limitNum - totalFound, seenIds)
                    if partial is not "" then
                        if resultList is not "" then set resultList to resultList & ", "
                        set resultList to resultList & partial
                    end if
                    set totalFound to totalFound + partialCount
                end repeat
            else
                set mb to mailbox theMailboxName of theAccount
                set {partial, partialCount, seenIds} to my searchInMailbox(mb, theField, theQuery, limitNum, seenIds)
                if partial is not "" then set resultList to partial
            end if
        end if

        return "[" & resultList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
