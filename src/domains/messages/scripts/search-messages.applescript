on searchInMailbox(theMailbox, theField, theQuery, remainingLimit, seenIds, afterDate, beforeDate, accountName)
    using terms from application "Mail"
        set resultList to ""
        set matchCount to 0
        set newSeenIds to seenIds
        set mboxName to my escapeForJson(my mailboxFullName(theMailbox))
        set acctName to my escapeForJson(accountName)
        if theQuery is "" then
            set matchedMessages to messages of theMailbox
        else if theField is "subject" then
            set matchedMessages to (messages of theMailbox whose subject contains theQuery)
        else if theField is "sender" then
            set matchedMessages to (messages of theMailbox whose sender contains theQuery)
        else
            set matchedMessages to (messages of theMailbox whose content contains theQuery)
        end if
        repeat with msg in matchedMessages
            if matchCount >= remainingLimit then exit repeat
            set msgId to id of msg
            if msgId is in newSeenIds then
                -- Skip duplicate (Gmail labels)
            else
                -- Date filtering (post-filter)
                set passesDate to true
                if afterDate is not missing value or beforeDate is not missing value then
                    set msgDateRcvd to date received of msg
                    if afterDate is not missing value and msgDateRcvd < afterDate then
                        set passesDate to false
                    end if
                    if beforeDate is not missing value and msgDateRcvd > beforeDate then
                        set passesDate to false
                    end if
                end if
                if passesDate then
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
                    set resultList to resultList & "\"id\": " & my integerForJson(msgId) & ", "
                    set resultList to resultList & "\"subject\": \"" & msgSubject & "\", "
                    set resultList to resultList & "\"sender\": \"" & msgSender & "\", "
                    set resultList to resultList & "\"dateReceived\": \"" & msgDate & "\", "
                    set resultList to resultList & "\"readStatus\": " & msgRead & ", "
                    set resultList to resultList & "\"flagged\": " & msgFlagged & ", "
                    set resultList to resultList & "\"flagIndex\": " & my integerForJson(msgFlagIndex) & ", "
                    set resultList to resultList & "\"hasAttachments\": " & msgHasAttach & ", "
                    set resultList to resultList & "\"mailboxName\": \"" & mboxName & "\", "
                    set resultList to resultList & "\"accountName\": \"" & acctName & "\""
                    set resultList to resultList & "}"
                    set matchCount to matchCount + 1
                    set end of newSeenIds to msgId
                end if
            end if
        end repeat
        return {resultList, matchCount, newSeenIds}
    end using terms from
end searchInMailbox


with timeout of {{eventTimeoutSeconds}} seconds
    tell application "Mail"
        try
            set theField to "{{field}}"
            set theQuery to "{{query}}"
            set theMailboxName to "{{mailboxName}}"
            set theAccountName to "{{accountName}}"
            if theAccountName is "__ALL__" or theMailboxName is "__ALL__" or (length of theAccountName) is 0 or (length of theMailboxName) is 0 then
                error "Search requires one account and one mailbox."
            end if
            if theField is not "subject" and theField is not "sender" and theField is not "content" then error "Invalid search field."
            set limitNum to {{limit}} as integer
            if limitNum < 1 or limitNum > 200 then error "Search limit must be between 1 and 200."
            set seenIds to { {{seenIds}} }
            set afterDate to missing value
            set beforeDate to missing value
            if "{{hasAfter}}" is "true" then set afterDate to (current date) - {{afterSeconds}}
            if "{{hasBefore}}" is "true" then set beforeDate to (current date) - {{beforeSeconds}}
            set theAccount to account theAccountName
            set actualAccountName to name of theAccount as text
            set mb to my resolveMailbox(theAccountName, theMailboxName)
            set {resultList, partialCount, newSeenIds} to my searchInMailbox(mb, theField, theQuery, limitNum, seenIds, afterDate, beforeDate, actualAccountName)
            return "[" & resultList & "]"
        on error errMsg number errNum
            return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & my integerForJson(errNum) & "}"
        end try
    end tell
end timeout
