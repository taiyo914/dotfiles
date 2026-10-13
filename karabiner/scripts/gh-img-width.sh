#!/bin/sh
# クリップボード内の <img> タグの width を 800 にして、height を消す。
# GitHub に画像を貼ったときに入る生の width / height を、PR 用の幅にそろえるために使う。
#
# height を残すと縦横比がくずれるので消す。width だけなら高さはブラウザが自動で決める。

# Karabiner から呼ばれると LANG が空で日本語が文字化けするので指定する
export LANG=en_US.UTF-8

/usr/bin/pbpaste | /usr/bin/perl -CS -pe '
  s{<img\b[^>]*>}{
    my $tag = $&;
    $tag =~ s/\s+height="?\d+"?//;
    $tag =~ s/\bwidth="?\d+"?/width=800/;
    $tag;
  }ge
' | /usr/bin/pbcopy
