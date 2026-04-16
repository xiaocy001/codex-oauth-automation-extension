const PAGE_OPEN_MODE = {
  NEW_TAB: 1,
  REUSE_DOMAIN_TAB: 2,
  CURRENT_TAB: 3,
};

const PAGE_CONTENT_MODE = {
  TEXT: 'text',
  HTML: 'html',
  VALUE: 'value',
  ATTRIBUTE: 'attribute',
};

class PageOperationTool {
  constructor() {
    this.domainTabMap = new Map();
  }

  hydrateRegistry(registry = {}) {
    this.domainTabMap = new Map(
      Object.entries(registry).filter(([, tabId]) => Number.isInteger(tabId) && tabId > 0),
    );
  }

  exportRegistry() {
    return Object.fromEntries(this.domainTabMap.entries());
  }

  async loadPage(openMode, address) {
    const targetUrl = this.normalizeUrl(address);
    const domainKey = this.getDomainKey(targetUrl);

    switch (Number(openMode)) {
      case PAGE_OPEN_MODE.NEW_TAB:
        return this.openInNewTab(domainKey, targetUrl);
      case PAGE_OPEN_MODE.REUSE_DOMAIN_TAB:
        return this.openInKnownDomainTab(domainKey, targetUrl);
      case PAGE_OPEN_MODE.CURRENT_TAB:
        return this.openInCurrentTab(domainKey, targetUrl);
      default:
        throw new Error('打开方式无效');
    }
  }

  async getPageObject(objectIdentifier) {
    const pageObject = await this.normalizePageObject(objectIdentifier);
    const result = await this.executeInTab(
      pageObject.tabId,
      ({ selector }) => {
        const element = document.querySelector(selector);
        if (!element) {
          return { found: false };
        }

        return {
          found: true,
          tagName: element.tagName?.toLowerCase() || '',
          text: element.textContent?.trim() || '',
          value: 'value' in element ? element.value ?? '' : '',
        };
      },
      { selector: pageObject.selector },
    );

    if (!result?.found) {
      throw new Error('页面对象不存在');
    }

    return {
      ...pageObject,
      tagName: result.tagName,
      text: result.text,
      value: result.value,
    };
  }

  async inputValue(target) {
    const pageObject = await this.normalizePageObject(target);
    const value = this.normalizeInputValue(target?.value);
    const result = await this.executeInTab(
      pageObject.tabId,
      ({ selector, value: nextValue }) => {
        const element = document.querySelector(selector);
        if (!element) {
          return { success: false, error: '页面对象不存在' };
        }

        const isEditable = element instanceof HTMLInputElement
          || element instanceof HTMLTextAreaElement
          || element instanceof HTMLSelectElement;

        if (isEditable) {
          element.focus();
          element.value = nextValue;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, value: element.value ?? '' };
        }

        if (element.isContentEditable) {
          element.focus();
          element.textContent = nextValue;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, value: element.textContent ?? '' };
        }

        return { success: false, error: '目标对象不支持填值' };
      },
      { selector: pageObject.selector, value },
    );

    if (!result?.success) {
      throw new Error(result?.error || '输入框填值失败');
    }

    return {
      ...pageObject,
      value: result.value,
    };
  }

  async click(target) {
    const pageObject = await this.normalizePageObject(target);
    const result = await this.executeInTab(
      pageObject.tabId,
      ({ selector }) => {
        const element = document.querySelector(selector);
        if (!element) {
          return { success: false, error: '页面对象不存在' };
        }

        element.scrollIntoView({ block: 'center', inline: 'center' });
        element.click();
        return {
          success: true,
          text: element.textContent?.trim() || '',
        };
      },
      { selector: pageObject.selector },
    );

    if (!result?.success) {
      throw new Error(result?.error || '点击失败');
    }

    return {
      ...pageObject,
      text: result.text,
    };
  }

  async readPageContent(target) {
    const pageObject = await this.normalizePageObject(target);
    const contentMode = this.normalizeContentMode(target?.contentMode);
    const attributeName = this.normalizeAttributeName(target?.attributeName, contentMode);
    const result = await this.executeInTab(
      pageObject.tabId,
      ({ selector, contentMode: mode, attributeName: attribute }) => {
        const element = document.querySelector(selector);
        if (!element) {
          return { success: false, error: '页面对象不存在' };
        }

        if (mode === 'html') {
          return { success: true, content: element.innerHTML ?? '' };
        }

        if (mode === 'value') {
          return { success: true, content: 'value' in element ? element.value ?? '' : '' };
        }

        if (mode === 'attribute') {
          return { success: true, content: element.getAttribute(attribute) ?? '' };
        }

        return { success: true, content: element.textContent?.trim() || '' };
      },
      { selector: pageObject.selector, contentMode, attributeName },
    );

    if (!result?.success) {
      throw new Error(result?.error || '页面内容读取失败');
    }

    return {
      ...pageObject,
      contentMode,
      attributeName,
      content: result.content,
    };
  }

  async waitForUrlMatch(target) {
    const pageObject = await this.normalizePageObject(target);
    const matcher = this.normalizeUrlMatcher(target);
    const result = await this.executeInTab(
      pageObject.tabId,
      ({ matcher: nextMatcher }) => ({
        href: location.href,
        matched: location.href.includes(nextMatcher),
      }),
      { matcher },
    );

    return {
      ...pageObject,
      href: result?.href || '',
      matched: Boolean(result?.matched),
    };
  }

  normalizeUrl(address) {
    try {
      return new URL(address).toString();
    } catch (error) {
      throw new Error('打开地址无效');
    }
  }

  getDomainKey(targetUrl) {
    return new URL(targetUrl).hostname;
  }

  async openInNewTab(domainKey, targetUrl) {
    const tab = await chrome.tabs.create({
      url: targetUrl,
      active: true,
    });
    this.rememberTab(domainKey, tab?.id);
    return {
      mode: PAGE_OPEN_MODE.NEW_TAB,
      tabId: tab?.id ?? null,
      reused: false,
      url: targetUrl,
    };
  }

  async openInKnownDomainTab(domainKey, targetUrl) {
    const knownTabId = this.domainTabMap.get(domainKey);
    if (Number.isInteger(knownTabId) && knownTabId > 0) {
      try {
        const tab = await chrome.tabs.update(knownTabId, {
          url: targetUrl,
          active: true,
        });
        this.rememberTab(domainKey, tab?.id);
        return {
          mode: PAGE_OPEN_MODE.REUSE_DOMAIN_TAB,
          tabId: tab?.id ?? null,
          reused: true,
          url: targetUrl,
        };
      } catch (error) {
        this.domainTabMap.delete(domainKey);
      }
    }

    return this.openInNewTab(domainKey, targetUrl);
  }

  async openInCurrentTab(domainKey, targetUrl) {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    if (!activeTab?.id) {
      return this.openInNewTab(domainKey, targetUrl);
    }

    const tab = await chrome.tabs.update(activeTab.id, {
      url: targetUrl,
      active: true,
    });
    this.rememberTab(domainKey, tab?.id);
    return {
      mode: PAGE_OPEN_MODE.CURRENT_TAB,
      tabId: tab?.id ?? null,
      reused: true,
      url: targetUrl,
    };
  }

  rememberTab(domainKey, tabId) {
    if (Number.isInteger(tabId) && tabId > 0) {
      this.domainTabMap.set(domainKey, tabId);
    }
  }

  async normalizePageObject(objectIdentifier) {
    if (!objectIdentifier || typeof objectIdentifier !== 'object') {
      throw new Error('页面对象标识无效');
    }

    const selector = typeof objectIdentifier.selector === 'string' ? objectIdentifier.selector.trim() : '';
    if (!selector) {
      throw new Error('页面对象标识缺少 selector');
    }

    const tabId = await this.resolveTargetTabId(objectIdentifier);
    return {
      selector,
      tabId,
      domain: this.findDomainByTabId(tabId),
    };
  }

  async resolveTargetTabId(target) {
    if (Number.isInteger(target?.tabId) && target.tabId > 0) {
      return target.tabId;
    }

    if (typeof target?.domain === 'string' && target.domain.trim()) {
      const domainTabId = this.domainTabMap.get(target.domain.trim());
      if (Number.isInteger(domainTabId) && domainTabId > 0) {
        return domainTabId;
      }
    }

    if (typeof target?.url === 'string' && target.url.trim()) {
      const domainKey = this.getDomainKey(this.normalizeUrl(target.url.trim()));
      const domainTabId = this.domainTabMap.get(domainKey);
      if (Number.isInteger(domainTabId) && domainTabId > 0) {
        return domainTabId;
      }
    }

    if (target?.currentTab === true) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (activeTab?.id) {
        return activeTab.id;
      }
    }

    throw new Error('无法定位页面对象所属标签页');
  }

  findDomainByTabId(tabId) {
    for (const [domainKey, savedTabId] of this.domainTabMap.entries()) {
      if (savedTabId === tabId) {
        return domainKey;
      }
    }
    return null;
  }

  normalizeInputValue(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    throw new Error('输入值无效');
  }

  normalizeUrlMatcher(target) {
    if (typeof target?.urlMatcher === 'string' && target.urlMatcher.trim()) {
      return target.urlMatcher.trim();
    }

    if (typeof target?.url === 'string' && target.url.trim()) {
      return target.url.trim();
    }

    throw new Error('缺少 URL 匹配条件');
  }

  normalizeContentMode(contentMode) {
    if (!contentMode) {
      return PAGE_CONTENT_MODE.TEXT;
    }

    if (Object.values(PAGE_CONTENT_MODE).includes(contentMode)) {
      return contentMode;
    }

    throw new Error('页面内容读取方式无效');
  }

  normalizeAttributeName(attributeName, contentMode) {
    if (contentMode !== PAGE_CONTENT_MODE.ATTRIBUTE) {
      return null;
    }

    if (typeof attributeName === 'string' && attributeName.trim()) {
      return attributeName.trim();
    }

    throw new Error('读取属性时必须提供 attributeName');
  }

  async executeInTab(tabId, func, args) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func,
        args: [args],
      });
      return result?.result;
    } catch (error) {
      throw new Error(error?.message || '页面脚本执行失败');
    }
  }
}

self.PAGE_OPEN_MODE = PAGE_OPEN_MODE;
self.PAGE_CONTENT_MODE = PAGE_CONTENT_MODE;
self.PageOperationTool = PageOperationTool;
