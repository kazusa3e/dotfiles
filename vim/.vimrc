" basic {{{
set nocompatible                        " disable vi-compatibility mode
set hidden                              " allow hiding unsaved buffers
set number                              " show line numbers
set backspace=indent,eol,start          " allow backspace over indent/eol/start
filetype plugin indent on               " enable filetype detection, plugins & indent
syntax on                               " enable syntax highlighting
set encoding=utf-8                      " set internal encoding to UTF-8
set noswapfile                          " disable swap files
set undofile                            " enable persistent undo
set undodir=$HOME/.vim/undo             " directory for undo files
set cursorline                          " highlight the current line
set autoread                            " auto-reload externally changed files
set updatetime=500                      " trigger swap write / CursorHold after 500ms
set scrolloff=5                         " keep 5 lines visible around cursor
let mapleader=' '                       " set leader key to space
set mouse=a                             " enable mouse in all modes
set signcolumn=number                   " merge sign column with line number
set sessionoptions+=tabpages,globals    " save tab pages and globals in sessions
set nrformats+=alpha                    " allow <C-a>/<C-x> on letters
" set modeline                            " enable mode lines in files
" set modelines=1                         " scan first/last 1 line for mode lines
" set exrc                                " allow per-directory .vimrc / .exrc
" }}}

" indent {{{
set expandtab                           " use spaces instead of tabs
set autoindent                          " copy indent from current line
set smartindent                         " smart auto-indent for C-like syntax
set infercase                          " case-insensitive completion, respect case of typed word

set tabstop=4                           " display tabs as 4 spaces
set shiftwidth=0                        " use tabstop value for shifting
set textwidth=0                         " disable automatic hard wrapping
set softtabstop=-1                      " follow shiftwidth/tabstop behavior
" set wrap                                " wrap long lines visually
" }}}

" search {{{
set ignorecase                          " case-insensitive search
set smartcase                           " case-sensitive if uppercase present
set incsearch                           " incremental search (live highlighting)
set hlsearch                            " highlight all search matches
" clear search highlighting
nnoremap <c-n> <cmd>nohlsearch<cr>
" }}}

" disable keybindings {{{

" defined in neovim

" disable s (surround)
nnoremap s <nop>
nnoremap S <nop>
xnoremap s <nop>
xnoremap S <nop>

" disable q (comment)
" use `Q` to record macros instead of `q`
nnoremap Q q
xnoremap Q q
nnoremap q <nop>
xnoremap q <nop>
" }}}

" buffer {{{
" previous buffer
nnoremap [b <cmd>bprevious<cr>
" next buffer
nnoremap ]b <cmd>bnext<cr>
" close all buffers
nnoremap <leader>x <cmd>bufdo bw<cr>
" close current buffer and switch to next
nnoremap <s-x> <cmd>try <bar> bn <bar> bd # <bar> catch <bar> enew <bar> endtry <cr>
" jump to last change position
nnoremap <leader>a `.
" }}}

" window {{{
" move to left window
nnoremap <c-h> <c-w>h
" move to right window
nnoremap <c-l> <c-w>l
" move to window below
nnoremap <c-j> <c-w>j
" move to window above
nnoremap <c-k> <c-w>k
" }}}

" split {{{
set splitbelow                          " horizontal split puts new window below
set splitright                          " vertical split puts new window to the right
" horizontal split
nnoremap <leader>\ <cmd>split<cr>
" vertical split
noremap <leader>\| <cmd>vsplit<cr>
" }}}

" yank {{{
" yank to system clipboard
nnoremap Y "+y
" yank line to system clipboard
nnoremap YY "+yy
" visual mode yank to system clipboard
xnoremap Y "+y
" }}}

" new line {{{
" insert new line below, stay normal mode
nnoremap o o<esc>
" insert new line above, stay normal mode
nnoremap O O<esc>
" }}}

" display move {{{
" nnoremap j gj                           " move down by display line (for wrapped lines)
" nnoremap k gk                           " move up by display line (for wrapped lines)
" }}}

" indent {{{
" indent left and keep selection
xnoremap < <gv
" indent right and keep selection
xnoremap > >gv
" }}}

" completion & fold & formatoptions {{{

" complete: sources for insert-mode completion
"   .  = current buffer
"   w  = buffers from other windows (^5 = scan up to 5)
"   b  = other loaded buffers (^5)
"   u  = unloaded buffers (^5)
"   t  = tags
"   i  = current / included files
set complete=.,w^5,b^5,u^5,t,i

" completeopt: behaviour of the completion popup menu
"   menuone   = always show popup even for single match
"   popup     = show preview info in a popup window (Neovim)
"   preinsert = VSCode-style ghost: the first candidate is shown beyond the
"               typed prefix (hl-PreInsert) but NOT committed; only <Tab>/<C-y>
"               commits. Without it the first candidate is INSERTED into the
"               buffer as you type, so typing 's' for 'std' yields 'std' and a
"               following 'td' corrupts the word ('stdtd').
" 'preinsert' is Neovim-only, so it is appended in lua/options.lua.
" In plain Vim, 'autocomplete' auto-enables 'noselect' instead (nothing is
" inserted until <C-y>/<Tab>), which gives the same "no premature commit"
" safety.
set completeopt=menuone,popup

" autocomplete: enables automatic keyword/completion suggestions while typing
" (plain Vim only; Neovim disables it globally in lua/options.lua and instead
" turns it on per-buffer in lua/lsp.lua as a fallback for buffers without a
" completion-capable LSP server; LSP buffers use vim.lsp.completion which
" triggers on every word char)
set autocomplete

" <Tab> in insert mode: accept the selected completion if popup
" is visible, otherwise insert a literal tab
inoremap <expr> <tab> pumvisible() ? "\<c-y>" : "\<tab>"

" <Enter> never accepts a completion: cancel the popup first, then newline.
" (Without this, plain Vim commits a menu item once it was navigated to.)
inoremap <expr> <cr> pumvisible() ? "\<c-e>\<cr>" : "\<cr>"

" <Esc>: revert any completion text/ghost before leaving insert mode, so no
" half-typed candidate lingers in the buffer.
inoremap <expr> <esc> pumvisible() ? "\<c-e>\<esc>" : "\<esc>"

" Folds: keep disabled by default (Neovim sets tree-sitter foldexpr
" separately; Vim defaults to manual folding, which is also off).
set nofoldenable

" disable automatic comment continuation: r(Enter)/o(oO)/c(auto-wrap)
set formatoptions-=cro

" filetype plugins often re-set formatoptions, reapply on each FileType
augroup SharedFormatOptions
  autocmd!
  autocmd FileType * set formatoptions-=cro
augroup END

" <leader>=: indent the whole buffer.
nnoremap <leader>= mzgg=G`z

" <leader>gq: format the whole buffer.
nnoremap <leader>gq mzgggqG`z
" }}}

" colorscheme {{{
if has('termguicolors')
    set termguicolors                   " enable true color support
endif
set background=dark                     " use dark background theme
colorscheme default                     " set colorscheme to default

augroup SharedAppearance
  autocmd!
  autocmd VimEnter * highlight Normal guibg=NONE
if has('nvim')
  autocmd VimEnter * highlight NormalFloat guibg=NONE
endif
augroup END
" }}}

" terminal {{{
if exists("##TermOpen")
    augroup SharedTerminal
      autocmd!
      autocmd TermOpen * setlocal nonumber    " hide line numbers in terminal
      autocmd TermOpen * startinsert          " enter insert mode when opening terminal
    augroup END
endif
" }}}

" restore cursor position {{{
augroup SharedRestoreCursor
  autocmd!
  autocmd BufReadPost *
    \ if line("'\"") > 0 && line("'\"") <= line("$") |
    \   execute "normal! g`\"" |
    \ endif
augroup END
" }}}

" vim: foldmethod=marker
