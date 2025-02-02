import PropTypes from '../_util/vue-types';
import ResizeObserver from 'resize-observer-polyfill';
import SubMenu from './SubMenu';
import BaseMixin from '../_util/BaseMixin';
import { getWidth, setStyle, menuAllProps } from './util';
import { cloneElement } from '../_util/vnode';
import { getPropsData, getAllProps, getSlot, findDOMNode } from '../_util/props-util';

const MENUITEM_OVERFLOWED_CLASSNAME = 'menuitem-overflowed';
const FLOAT_PRECISION_ADJUST = 0.5;

const DOMWrap = {
  name: 'DOMWrap',
  mixins: [BaseMixin],
  data() {
    this.resizeObserver = null;
    this.mutationObserver = null;

    // original scroll size of the list
    this.originalTotalWidth = 0;

    // copy of overflowed items
    this.overflowedItems = [];

    // cache item of the original items (so we can track the size and order)
    this.menuItemSizes = [];
    return {
      lastVisibleIndex: undefined,
    };
  },

  mounted() {
    this.$nextTick(() => {
      this.setChildrenWidthAndResize();
      if (this.level === 1 && this.mode === 'horizontal') {
        const menuUl = findDOMNode(this);
        if (!menuUl) {
          return;
        }
        this.resizeObserver = new ResizeObserver(entries => {
          entries.forEach(this.setChildrenWidthAndResize);
        });

        [].slice
          .call(menuUl.children)
          .concat(menuUl)
          .forEach(el => {
            this.resizeObserver.observe(el);
          });

        if (typeof MutationObserver !== 'undefined') {
          this.mutationObserver = new MutationObserver(() => {
            this.resizeObserver.disconnect();
            [].slice
              .call(menuUl.children)
              .concat(menuUl)
              .forEach(el => {
                this.resizeObserver.observe(el);
              });
            this.setChildrenWidthAndResize();
          });
          this.mutationObserver.observe(menuUl, {
            attributes: false,
            childList: true,
            subTree: false,
          });
        }
      }
    });
  },

  beforeUnmount() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  },
  methods: {
    // get all valid menuItem nodes
    getMenuItemNodes() {
      const { prefixCls } = this.$props;
      const ul = findDOMNode(this);
      if (!ul) {
        return [];
      }

      // filter out all overflowed indicator placeholder
      return [].slice
        .call(ul.children)
        .filter(node => node.className.split(' ').indexOf(`${prefixCls}-overflowed-submenu`) < 0);
    },

    getOverflowedSubMenuItem(keyPrefix, overflowedItems, renderPlaceholder) {
      const { overflowedIndicator, level, mode, prefixCls, theme } = this.$props;
      if (level !== 1 || mode !== 'horizontal') {
        return null;
      }
      // put all the overflowed item inside a submenu
      // with a title of overflow indicator ('...')
      const copy = getSlot(this)[0];
      const { title, ...rest } = getAllProps(copy); // eslint-disable-line no-unused-vars
      let style = {};
      let key = `${keyPrefix}-overflowed-indicator`;
      let eventKey = `${keyPrefix}-overflowed-indicator`;

      if (overflowedItems.length === 0 && renderPlaceholder !== true) {
        style = {
          display: 'none',
        };
      } else if (renderPlaceholder) {
        style = {
          visibility: 'hidden',
          // prevent from taking normal dom space
          position: 'absolute',
        };
        key = `${key}-placeholder`;
        eventKey = `${eventKey}-placeholder`;
      }

      const popupClassName = theme ? `${prefixCls}-${theme}` : '';
      const props = {};
      menuAllProps.forEach(k => {
        if (rest[k] !== undefined) {
          props[k] = rest[k];
        }
      });
      const subMenuProps = {
        title: overflowedIndicator,
        popupClassName,
        ...props,
        eventKey,
        disabled: false,
        class: `${prefixCls}-overflowed-submenu`,
        key,
        style,
      };

      return <SubMenu {...subMenuProps}>{overflowedItems}</SubMenu>;
    },

    // memorize rendered menuSize
    setChildrenWidthAndResize() {
      if (this.mode !== 'horizontal') {
        return;
      }
      const ul = findDOMNode(this);

      if (!ul) {
        return;
      }

      const ulChildrenNodes = ul.children;

      if (!ulChildrenNodes || ulChildrenNodes.length === 0) {
        return;
      }

      const lastOverflowedIndicatorPlaceholder = ul.children[ulChildrenNodes.length - 1];

      // need last overflowed indicator for calculating length;
      setStyle(lastOverflowedIndicatorPlaceholder, 'display', 'inline-block');

      const menuItemNodes = this.getMenuItemNodes();

      // reset display attribute for all hidden elements caused by overflow to calculate updated width
      // and then reset to original state after width calculation

      const overflowedItems = menuItemNodes.filter(
        c => c.className.split(' ').indexOf(MENUITEM_OVERFLOWED_CLASSNAME) >= 0,
      );

      overflowedItems.forEach(c => {
        setStyle(c, 'display', 'inline-block');
      });

      this.menuItemSizes = menuItemNodes.map(c => getWidth(c));

      overflowedItems.forEach(c => {
        setStyle(c, 'display', 'none');
      });
      this.overflowedIndicatorWidth = getWidth(ul.children[ul.children.length - 1]);
      this.originalTotalWidth = this.menuItemSizes.reduce((acc, cur) => acc + cur, 0);
      this.handleResize();
      // prevent the overflowed indicator from taking space;
      setStyle(lastOverflowedIndicatorPlaceholder, 'display', 'none');
    },

    handleResize() {
      if (this.mode !== 'horizontal') {
        return;
      }

      const ul = findDOMNode(this);
      if (!ul) {
        return;
      }
      const width = getWidth(ul);

      this.overflowedItems = [];
      let currentSumWidth = 0;

      // index for last visible child in horizontal mode
      let lastVisibleIndex;

      // float number comparison could be problematic
      // e.g. 0.1 + 0.2 > 0.3 =====> true
      // thus using FLOAT_PRECISION_ADJUST as buffer to help the situation
      if (this.originalTotalWidth > width + FLOAT_PRECISION_ADJUST) {
        lastVisibleIndex = -1;

        this.menuItemSizes.forEach(liWidth => {
          currentSumWidth += liWidth;
          if (currentSumWidth + this.overflowedIndicatorWidth <= width) {
            lastVisibleIndex += 1;
          }
        });
      }

      this.setState({ lastVisibleIndex });
    },

    renderChildren(children) {
      // need to take care of overflowed items in horizontal mode
      const { lastVisibleIndex } = this.$data;
      const className = this.$attrs.class || '';
      return (children || []).reduce((acc, childNode, index) => {
        let item = childNode;
        const eventKey = getPropsData(childNode).eventKey;
        if (this.mode === 'horizontal') {
          let overflowed = this.getOverflowedSubMenuItem(eventKey, []);
          if (
            lastVisibleIndex !== undefined &&
            className.indexOf(`${this.prefixCls}-root`) !== -1
          ) {
            if (index > lastVisibleIndex) {
              item = cloneElement(
                childNode,
                // 这里修改 eventKey 是为了防止隐藏状态下还会触发 openkeys 事件
                {
                  style: { display: 'none' },
                  eventKey: `${eventKey}-hidden`,
                  class: MENUITEM_OVERFLOWED_CLASSNAME,
                },
              );
            }
            if (index === lastVisibleIndex + 1) {
              this.overflowedItems = children.slice(lastVisibleIndex + 1).map(c => {
                return cloneElement(
                  c,
                  // children[index].key will become '.$key' in clone by default,
                  // we have to overwrite with the correct key explicitly
                  {
                    key: getPropsData(c).eventKey,
                    mode: 'vertical-left',
                  },
                );
              });

              overflowed = this.getOverflowedSubMenuItem(eventKey, this.overflowedItems);
            }
          }

          const ret = [...acc, overflowed, item];

          if (index === children.length - 1) {
            // need a placeholder for calculating overflowed indicator width
            ret.push(this.getOverflowedSubMenuItem(eventKey, [], true));
          }
          return ret;
        }
        return [...acc, item];
      }, []);
    },
  },

  render() {
    const Tag = this.$props.tag;
    return <Tag>{this.renderChildren(getSlot(this))}</Tag>;
  },
};

DOMWrap.props = {
  mode: PropTypes.oneOf(['horizontal', 'vertical', 'vertical-left', 'vertical-right', 'inline']),
  prefixCls: PropTypes.string,
  level: PropTypes.number,
  theme: PropTypes.string,
  overflowedIndicator: PropTypes.any,
  visible: PropTypes.looseBool,
  hiddenClassName: PropTypes.string,
  tag: PropTypes.string.def('div'),
};

export default DOMWrap;
