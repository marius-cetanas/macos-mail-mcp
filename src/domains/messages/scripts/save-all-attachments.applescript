set saveFolderPath to "{{savePath}}"

tell application "Mail"
    try
        set theMailbox to mailbox "{{mailboxName}}" of account "{{accountName}}"
        set msg to (first message of theMailbox whose id is {{messageId}})
        set savedFilesJson to ""
        set savedCount to 0

        repeat with att in mail attachments of msg
            if downloaded of att is true then
                set attName to name of att as text
                -- Deduplicate: check filesystem to avoid overwriting existing files
                set fullSavePath to saveFolderPath & "/" & attName
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
                    set attName to candidateName
                    set fullSavePath to saveFolderPath & "/" & attName
                end if
                save att in POSIX file fullSavePath
                set escapedPath to my escapeForJson(fullSavePath)
                if savedFilesJson is not "" then set savedFilesJson to savedFilesJson & ", "
                set savedFilesJson to savedFilesJson & "\"" & escapedPath & "\""
                set savedCount to savedCount + 1
            end if
        end repeat

        return "{\"success\": true, \"savedFiles\": [" & savedFilesJson & "], \"savePath\": \"" & my escapeForJson(saveFolderPath) & "\"}"
    on error errMsg number errNum
        return "{\"error\": \"" & my escapeForJson(errMsg) & "\", \"errorNumber\": " & errNum & "}"
    end try
end tell
