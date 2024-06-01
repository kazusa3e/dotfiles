local automates = require 'automates'

local repos = {
    {
        path = '/Users/kazusa/Code/automates',
        remotes = { { name = 'luna', branches = { 'master', 'dev', 'feat/*' } }, }
    },
    {
        path = '/Users/kazusa/Code/hosted',
        remotes = {
            { name = 'luna',   branches = { 'master', 'dev', 'feat/*' } },
            { name = 'github', branches = { 'master' } },
        }
    },
    {
        path = '/Users/kazusa/Code/dotfiles',
        remotes = {
            { name = 'luna',   branches = { 'master', 'dev', 'feat/*' } },
            { name = 'github', branches = { 'master' } },
        }
    },
    {
        path = '/Users/kazusa/Code/anki',
        remotes = { { name = 'luna', branches = { 'master', 'dev', 'feat/*' } }, }
    },
    {
        path = '/Users/kazusa/Code/docker-images',
        remotes = { { name = 'luna', branches = { 'master', 'dev', 'feat/*' } }, }
    },
    {
        path = '/Users/kazusa/Code/safeboxfs',
        remotes = { { name = 'luna', branches = { 'master', 'dev', 'feat/*' } }, }
    },
    {
        path = '/Users/kazusa/Course/UCB CS61B - Data Structures/solutions/',
        remotes = {
            { name = 'luna',   branches = { 'master', 'dev', 'feat/*' } },
            { name = 'github', branches = { 'master' } },
        }
    },
}

Autogit = {}

function Autogit.run()
    for _, repo in ipairs(repos) do
        local args = { '-p', repo.path }
        for _, remote in ipairs(repo.remotes) do
            table.insert(args, '-r'); table.insert(args, remote.name);
            table.insert(args, '-b'); table.insert(args, '"' .. table.concat(remote.branches, ',') .. '"');
        end
        -- print(table.concat(args, ' '))
        automates.runTask(
            '/Users/kazusa/Code/automates/autogit.mts',
            args,
            automates.composeLogPath('autogit', 'out'),
            automates.composeLogPath('autogit', 'err')
        )
        print('Syncing ' .. repo.path .. ' ...');
    end
end

-- hs.timer.doAt('22:00', '1d', function()
--     Autogit.run()
-- end):start();

return Autogit
