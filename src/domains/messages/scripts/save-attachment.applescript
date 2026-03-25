set saveFolderPath to "{{savePath}}"
-- Read attachment name from temp file to avoid AppleScript string escaping issues
set targetAttName to do shell script "cat " & quoted form of "{{attNameFile}}"

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to (first message of theMailbox whose id is {{messageId}})

        set targetAttachment to missing value
        repeat with att in mail attachments of msg
            if name of att as text is targetAttName then
                set targetAttachment to att
                exit repeat
            end if
        end repeat

        if targetAttachment is missing value then
            return "{\"error\": \"Attachment not found\", \"errorNumber\": -1}"
        end if

        if downloaded of targetAttachment is false then
            return "{\"error\": \"Attachment is not yet downloaded. Open the message in Mail.app first.\", \"errorNumber\": -2}"
        end if
        set attName to name of targetAttachment as text
        set fullSavePath to saveFolderPath & "/" & attName
        -- Check filesystem to avoid overwriting existing files
        set fileExists to (do shell script "test -e " & quoted form of fullSavePath & " && echo yes || echo no")
        if fileExists is "yes" then
            set dotOffset to -1
            repeat with ci from (length of attName) to 1 by -1
                if character ci of attName is "." then
                    set dotOffset to ci
                    exit repeat
                end if
            end repeat
            set seqNum to 2
            if dotOffset > 0 then
                set baseName to text 1 thru (dotOffset - 1) of attName
                set extPart to text dotOffset thru -1 of attName
            else
                set baseName to attName
                set extPart to ""
            end if
            set candidateName to baseName & " (" & seqNum & ")" & extPart
            set candidatePath to saveFolderPath & "/" & candidateName
            set candidateExists to (do shell script "test -e " & quoted form of candidatePath & " && echo yes || echo no")
            repeat while candidateExists is "yes"
                set seqNum to seqNum + 1
                set candidateName to baseName & " (" & seqNum & ")" & extPart
                set candidatePath to saveFolderPath & "/" & candidateName
                set candidateExists to (do shell script "test -e " & quoted form of candidatePath & " && echo yes || echo no")
            end repeat
            set fullSavePath to saveFolderPath & "/" & candidateName
        end if

        save targetAttachment in POSIX file fullSavePath

        return "{\"success\": true, \"path\": \"" & my escapeForJson(fullSavePath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
