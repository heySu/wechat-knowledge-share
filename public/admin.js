// 后台交互增强：没有构建步骤，原生 JS 直接跑。
(function () {
  'use strict';

  // 提示条 4 秒后淡出
  document.querySelectorAll('[data-flash]').forEach(function (node) {
    setTimeout(function () {
      node.style.transition = 'opacity .4s';
      node.style.opacity = '0';
      setTimeout(function () {
        node.remove();
      }, 400);
    }, 4000);
  });

  // 删除确认
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      if (!window.confirm(form.getAttribute('data-confirm') || '确定执行该操作？')) {
        event.preventDefault();
      }
    });
  });

  // Markdown 预览
  document.querySelectorAll('[data-md-preview]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var source = document.querySelector(button.getAttribute('data-md-preview'));
      var target = document.querySelector(button.getAttribute('data-md-target'));
      if (!source || !target) return;
      button.disabled = true;
      button.textContent = '渲染中…';
      try {
        var response = await fetch('/admin/api/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
          body: JSON.stringify({ markdown: source.value }),
        });
        var data = await response.json();
        target.innerHTML = data.html || '<p class="muted">没有内容</p>';
      } catch (err) {
        target.innerHTML = '<p class="muted">预览失败：' + err.message + '</p>';
      } finally {
        button.disabled = false;
        button.textContent = '刷新预览';
      }
    });
  });

  // 设置页：模式卡片高亮
  document.querySelectorAll('.radio-card input[type="radio"]').forEach(function (input) {
    input.addEventListener('change', function () {
      document.querySelectorAll('.radio-card').forEach(function (card) {
        card.classList.toggle('checked', card.contains(input) && input.checked);
      });
    });
  });

  // 设置页：测试微信连接
  var testButton = document.querySelector('[data-test-wechat]');
  if (testButton) {
    testButton.addEventListener('click', async function () {
      var result = document.getElementById('test-result');
      testButton.disabled = true;
      if (result) result.textContent = '测试中…';
      try {
        var response = await fetch('/admin/api/test-wechat', {
          method: 'POST',
          headers: { 'x-requested-with': 'fetch' },
        });
        var data = await response.json();
        if (result) {
          result.textContent = (data.ok ? '✓ ' : '✗ ') + data.message;
          result.style.color = data.ok ? '#059a4c' : '#b42318';
        }
      } catch (err) {
        if (result) {
          result.textContent = '✗ ' + err.message;
          result.style.color = '#b42318';
        }
      } finally {
        testButton.disabled = false;
      }
    });
  }

  // 正文编辑器：Tab 缩进两个空格，避免焦点跳到下一个控件
  var contentInput = document.querySelector('.code-input');
  if (contentInput) {
    contentInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      var start = contentInput.selectionStart;
      var end = contentInput.selectionEnd;
      contentInput.value = contentInput.value.slice(0, start) + '  ' + contentInput.value.slice(end);
      contentInput.selectionStart = contentInput.selectionEnd = start + 2;
    });
  }
})();
