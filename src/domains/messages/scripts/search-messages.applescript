on escapeQuotes(theString)
    set resultStr to ""
    repeat with i from 1 to length of theString
        set c to character i of theString
        if c is "\"" then
            set resultStr to resultStr & "\\\""
        else if c is "\\" then
            set resultStr to resultStr & "\\\\"
        else
            set resultStr to resultStr & c
        end if
    end repeat
    return resultStr
end escapeQuotes

on searchInMailbox(theMailbox, theField, theQuery, limitNum)
    set resultList to ""
    set matchCount to 0
    if theField is "subject" then
        set matchedMessages to (messages of theMailbox whose subject contains theQuery)
    else if theField is "sender" then
        set matchedMessages to (messages of theMailbox whose sender contains theQuery)
    else
        set matchedMessages to (messages of theMailbox whose content contains theQuery)
    end if
    repeat with msg in matchedMessages
        if matchCount >= limitNum then exit repeat
        set msgId to id of msg
        set msgSubject to my escapeQuotes(subject of msg as text)
        set msgSender to my escapeQuotes(sender of msg as text)
        set msgDate to date received of msg as «class isot» as string
        set msgRead to read status of msg
        set msgFlagged to flagged status of msg
        set msgFlagIndex to flag index of msg
        set msgHasAttach to has attachment of msg
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
    end repeat
    return resultList
end searchInMailbox

tell application "Mail"
    try
        set theField to "{{field}}"
        set theQuery to "{{query}}"
        set theMailboxName to "{{mailboxName}}"
        set theAccountName to "{{accountName}}"
        set limitNum to {{limit}} as integer

        set resultList to ""

        if theAccountName is "__ALL__" then
            repeat with acct in every account
                if theMailboxName is "__ALL__" then
                    repeat with mb in every mailbox of acct
                        set partial to my searchInMailbox(mb, theField, theQuery, limitNum)
                        if partial is not "" then
                            if resultList is not "" then set resultList to resultList & ", "
                            set resultList to resultList & partial
                        end if
                    end repeat
                else
                    try
                        set mb to mailbox theMailboxName of acct
                        set partial to my searchInMailbox(mb, theField, theQuery, limitNum)
                        if partial is not "" then
                            if resultList is not "" then set resultList to resultList & ", "
                            set resultList to resultList & partial
                        end if
                    end try
                end if
            end repeat
        else
            set theAccount to account theAccountName
            if theMailboxName is "__ALL__" then
                repeat with mb in every mailbox of theAccount
                    set partial to my searchInMailbox(mb, theField, theQuery, limitNum)
                    if partial is not "" then
                        if resultList is not "" then set resultList to resultList & ", "
                        set resultList to resultList & partial
                    end if
                end repeat
            else
                set mb to mailbox theMailboxName of theAccount
                set partial to my searchInMailbox(mb, theField, theQuery, limitNum)
                if partial is not "" then set resultList to partial
            end if
        end if

        return "[" & resultList & "]"
    on error errMsg number errNum
        return "{\"error\": \"" & errMsg & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
