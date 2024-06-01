vim.cmd [[ source $HOME/.vimrc ]]

--- ========================================
---              Themes
--- ========================================
--- {{{
table.insert(lvim.plugins, {
    'sainnhe/edge',
    config = function()
        vim.g.edge_style = 'default'
        vim.g.edge_disable_italic_comment = true
        vim.g.edge_diagnostic_text_highlight = true
        vim.g.edge_diagnostic_line_highlight = true
        vim.g.edge_diagnostic_virtual_text = 'highlighted'
        vim.g.edge_better_performance = true
    end

})
vim.o.background = 'light'
lvim.colorscheme = 'edge'
lvim.builtin.lualine.options.theme = 'edge'

table.insert(lvim.plugins, {
    'folke/noice.nvim',
    dependencies = {
        'muniftanjim/nui.nvim', 'rcarriga/nvim-notify'
    },
    config = function()
        require 'notify'.setup {}
        require 'noice'.setup {}
    end
})
lvim.builtin.gitsigns.opts.signcolumn = true
vim.o.signcolumn = 'yes'
lvim.builtin.bufferline.active = false
-- ======================================== }}}

--- ========================================
---              Comments
--- ========================================
--- {{{
lvim.builtin.comment = {
    padding = true,
    sticky = false,
    extra = nil,
    toggler = { line = 'qq', block = 'QQ' },
    opleader = { line = 'q', block = 'Q' },
    mappings = { basic = true, extra = false, }
}

-- ======================================== }}}

--- ========================================
---              Copilot
--- ========================================
--- {{{
-- table.insert(lvim.plugins, {
--     'zbirenbaum/copilot-cmp',
--     event = 'InsertEnter',
--     dependencies = { 'zbirenbaum/copilot.lua' },
--     config = function()
--         vim.defer_fn(function()
--             require('copilot').setup()
--             require('copilot_cmp').setup()
--         end, 100)
--     end,
-- })
--- ======================================== }}}

--- ========================================
---              Completion
--- ========================================
--- {{{

local cmp = require 'cmp'
local luasnip = require 'luasnip'
lvim.builtin.cmp.sources = {
    { name = 'nvim_lsp' },
    { name = 'copilot' },
    { name = 'luasnip' },
    { name = 'buffer' },
    { name = 'path' },
}
table.insert(lvim.plugins, { 'onsails/lspkind.nvim' })
vim.api.nvim_set_hl(0, 'CmpItemKindCopilot', { fg = '#6CC644' })
lvim.builtin.cmp.formatting.format = require 'lspkind'.cmp_format {
    mode = 'symbol',
    symbol_map = { Copilot = '' }
}
lvim.builtin.cmp.mapping = {
    ['<c-u>'] = cmp.mapping.scroll_docs(-4),
    ['<c-d>'] = cmp.mapping.scroll_docs(4),
    ['<up>'] = cmp.mapping(function(fallback)
        if cmp.visible() then cmp.select_prev_item() else fallback() end
    end, { 'i', 's' }),
    ['<down>'] = cmp.mapping(function(fallback)
        if cmp.visible() then cmp.select_next_item() else fallback() end
    end, { 'i', 's' }),
    ['<TAB>'] = cmp.mapping(function(fallback)
        if cmp.visible() then
            cmp.confirm()
        elseif luasnip.expand_or_locally_jumpable() then
            luasnip.expand_or_jump()
        else
            fallback()
        end
    end, { 'i', 's' })
}
lvim.builtin.cmp.completion.completeopt = 'menu,menuone,noinsert'
-- NOTE: Clear snip jumplist when exit insert mode.
-- SEE: <https://github.com/L3MON4D3/LuaSnip/issues/258>
vim.api.nvim_create_autocmd('ModeChanged', {
    pattern = '*',
    callback = function()
        if ((vim.v.event.old_mode == 's' and vim.v.event.new_mode == 'n') or vim.v.event.old_mode == 'i')
            and require('luasnip').session.current_nodes[vim.api.nvim_get_current_buf()]
            and not require('luasnip').session.jump_active
        then
            require('luasnip').unlink_current()
        end
    end
})
--- ======================================== }}}

--- ========================================
---             Terminal
--- ========================================
--- {{{
lvim.builtin.terminal.open_mapping = '<c-q>'
vim.api.nvim_set_keymap('t', '`', '<c-\\><c-n>', { noremap = true })
--- ======================================== }}}

--- ========================================
---             Key mappings
--- ========================================
--- {{{
lvim.keys.normal_mode['<c-p>'] = '<cmd>Telescope<cr>'

lvim.lsp.buffer_mappings.normal_mode['gd'] = { vim.lsp.buf.definition, 'Goto Definition' }
-- lvim.lsp.buffer_mappings.normal_mode['gr'] = { vim.lsp.buf.references, 'Goto References' }
lvim.lsp.buffer_mappings.normal_mode['gr'] = { '<cmd>TroubleToggle lsp_references<cr>', 'Goto References' }
lvim.lsp.buffer_mappings.normal_mode['gR'] = { vim.lsp.buf.rename, 'Rename' }
lvim.lsp.buffer_mappings.normal_mode['gh'] = { vim.lsp.buf.hover, 'Hover Documents' }
-- lvim.lsp.buffer_mappings.normal_mode['gf'] = { require 'lvim.lsp.utils'.format, 'Format' }

lvim.builtin.which_key.mappings['f'] = { '<cmd>Telescope find_files<cr>', 'Find File' }
lvim.builtin.which_key.mappings['F'] = { '<cmd>Telescope live_grep<cr>', 'Find String' }
lvim.builtin.which_key.mappings['a'] = {
    ['o'] = { '<cmd>Telescope oldfiles<cr>', 'Old Files' }
}
lvim.builtin.which_key.mappings['s']['s'] = { '<cmd>Telescope buffers<cr>', 'Buffers' }
-- TODO: save without formatting
lvim.builtin.which_key.mappings['w'] = {'<cmd>w<cr>', 'Save without formatting'}
--- ======================================== }}}

--- ========================================
---             File Explorer
--- ========================================
--- {{{
lvim.builtin.nvimtree.setup.disable_netrw = true

lvim.builtin.nvimtree.setup.on_attach = function(bufnr)
    local api = require 'nvim-tree.api'
    vim.keymap.set('n', 'R', api.tree.reload, { buffer = bufnr })
    vim.keymap.set('n', 'r', api.fs.rename, { buffer = bufnr })
    vim.keymap.set('n', 'zM', api.tree.collapse_all, { buffer = bufnr })
    vim.keymap.set('n', 'zR', api.tree.expand_all, { buffer = bufnr })
    vim.keymap.set('n', 'x', api.fs.remove, { buffer = bufnr })
    vim.keymap.set('n', 'n', api.fs.create, { buffer = bufnr })
    vim.keymap.set('n', 'o', api.node.run.system, { buffer = bufnr })
    vim.keymap.set('n', '<cr>', api.node.open.edit, { buffer = bufnr })
    vim.keymap.set('n', '<C-v>', api.node.open.vertical, { buffer = bufnr })
    vim.keymap.set('n', '<C-s>', api.node.open.horizontal, { buffer = bufnr })
    vim.keymap.set('n', 'y', api.fs.copy.node, { buffer = bufnr })
    vim.keymap.set('n', 'p', api.fs.paste, { buffer = bufnr })
end

lvim.builtin.nvimtree.setup.renderer.icons.glyphs.git = {
    staged = '',
    unstaged = '',
    unmerged = '',
    renamed = '',
    untracked = '',
    deleted = '',
    ignored = ''
}
--- }}}


--- ========================================
---             Fix: clangd offset encoding
--- ========================================
--- {{{
vim.list_extend(lvim.lsp.automatic_configuration.skipped_servers, { 'clangd' })

local clangd_flags = {
    '--fallback-style=google',
    '--background-index',
    '-j=12',
    '--all-scopes-completion',
    '--pch-storage=disk',
    '--clang-tidy',
    '--log=error',
    '--completion-style=detailed',
    '--header-insertion=iwyu',
    '--header-insertion-decorators',
    '--enable-config',
    '--offset-encoding=utf-16',
    '--ranking-model=heuristics',
    '--folding-ranges',
}

local clangd_bin = 'clangd'

local opts = {
    cmd = { clangd_bin, unpack(clangd_flags) },
}
require('lvim.lsp.manager').setup('clangd', opts)
--- ======================================== }}}

--- ========================================
---             Autocommands
--- ========================================
--- {{{
-- enter insert mode when in termainal
vim.cmd [[
    autocmd TermOpen * startinsert
    autocmd TermOpen * setlocal nonumber
]]
--- ======================================== }}}

--- ========================================
---             ZK Notes
--- ========================================
lvim.builtin.which_key.mappings['n'] = {
    ['n'] = { '<cmd>e $HOME/todo.md<cr>', 'TODO' }
}
--- {{{
-- table.insert(lvim.plugins, {
--     'arnarg/todotxt.nvim',
--     dependencies = {
--         'muniftanjim/nui.nvim'
--     },
--     config = function()
--         require 'todotxt-nvim'.setup {
--             todo_file = "/Users/kazusa/Library/Mobile Documents/iCloud~md~obsidian/Documents/todo.txt"
--         }
--     end
-- })
-- table.insert(lvim.plugins, {
--     'zk-org/zk-nvim',
--     config = function()
--         require 'zk'.setup {
--             picker = 'telescope'
--         }
--     end
-- })
-- lvim.builtin.which_key.mappings['n'] = {
--     ['f'] = { '<cmd>ZkNotes<cr>', 'ZK Notes' },
--     ['t'] = { '<cmd>ZkTags<cr>', 'ZK Tags' },
--     ['d'] = { '<cmd>ZkNew { dir = "Journal", group = "journal" }<cr>', 'ZK Journal' },
-- }
-- vim.env.ZK_NOTEBOOK_DIR = vim.fn.expand '$HOME/wiki'
-- lvim.builtin.treesitter.highlight.additional_vim_regex_highlighting = { 'markdown' }
-- vim.cmd [[
-- augroup markdown_syntax
--     autocmd!
--     autocmd FileType markdown syn region markdownWikiLink matchgroup=markdownLinkDelimiter start="\[\[" end="\]\]" contains=markdownUrl keepend oneline concealends
--     autocmd FileType markdown syn region markdownLink matchgroup=markdownLinkDelimiter start="(" end=")" contains=markdownUrl keepend contained conceal
--     autocmd FileType markdown syn match markdownHashTag /\v#\w+(-\w+)?/
--     autocmd FileType markdown hi link markdownHashTag Keyword
-- augroup END
-- ]]
--- ======================================== }}}

table.insert(lvim.plugins, {
    'kevinhwang91/nvim-ufo',
    dependencies = { 'kevinhwang91/promise-async' }
})
require 'ufo'.setup {
    provider_selector = function(bufnr, filetype, buftype)
        if filetype == "markdown" then
            return { 'indent' }
        end
        return { 'treesitter', 'indent' }
    end,
    fold_virt_text_handler = function(virtText, lnum, endLnum, width, truncate)
        local newVirtText = {}
        local suffix = ('    <- %d lines'):format(endLnum - lnum)
        local sufWidth = vim.fn.strdisplaywidth(suffix)
        local targetWidth = width - sufWidth
        local curWidth = 0
        for _, chunk in ipairs(virtText) do
            local chunkText = chunk[1]
            local chunkWidth = vim.fn.strdisplaywidth(chunkText)
            if targetWidth > curWidth + chunkWidth then
                table.insert(newVirtText, chunk)
            else
                chunkText = truncate(chunkText, targetWidth - curWidth)
                local hlGroup = chunk[2]
                table.insert(newVirtText, { chunkText, hlGroup })
                chunkWidth = vim.fn.strdisplaywidth(chunkText)
                -- str width returned from truncate() may less than 2nd argument, need padding
                if curWidth + chunkWidth < targetWidth then
                    suffix = suffix .. (' '):rep(targetWidth - curWidth - chunkWidth)
                end
                break
            end
            curWidth = curWidth + chunkWidth
        end
        table.insert(newVirtText, { suffix, 'MoreMsg' })
        return newVirtText
    end,
    open_fold_hl_timeout = 0
}
vim.opt.foldlevel = 99
vim.cmd [[ highlight clear UfoFoldedBg ]]
lvim.keys.normal_mode['zR'] = '<cmd>lua require "ufo".openAllFolds()<cr>'
lvim.keys.normal_mode['zM'] = '<cmd>lua require "ufo".closeAllFolds()<cr>'

vim.cmd [[
    augroup remember_folds
        autocmd!
        autocmd BufWinLeave *.* silent! mkview
        autocmd BufWinEnter *.* silent! loadview
    augroup END
]]
-- vim.foldmethod = 'expr'
-- vim.foldexpr = 'nvim_treesitter#foldexpr()'

table.insert(lvim.plugins, {
    'sindrets/diffview.nvim',
    event = 'BufRead'
})


-- disable highlight selections
vim.cmd [[ autocmd! _general_settings ]]

table.insert(lvim.plugins, {
    'folke/trouble.nvim',
    cmd = 'TroubleToggle'
})
lvim.builtin.which_key.mappings['t'] = {
    name = 'Diagnostics',
    t = { '<cmd>TroubleToggle<cr>', 'trouble' },
    w = { '<cmd>TroubleToggle workspace_diagnostics<cr>', 'workspace' },
    d = { '<cmd>TroubleToggle document_diagnostics<cr>', 'document' },
    q = { '<cmd>TroubleToggle quickfix<cr>', 'quickfix' },
    l = { '<cmd>TroubleToggle loclist<cr>', 'loclist' },
    r = { '<cmd>TroubleToggle lsp_references<cr>', 'references' }
}

table.insert(lvim.plugins, {
    'Wansmer/treesj',
    -- keys = {'<leader>j'},
    config = function()
        require 'treesj'.setup {
            use_default_keymaps = false
        }
    end
})
lvim.builtin.which_key.mappings['j'] = {'<cmd>TSJToggle<cr>', 'Toggle split/join'}

vim.opt.clipboard = ""

--- vim: foldmethod=marker
