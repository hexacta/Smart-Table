(function (ng, undefined){
    'use strict';

ng.module('smart-table', []).run(['$templateCache', function ($templateCache) {
    $templateCache.put('template/smart-table/pagination.html',
        '<nav ng-if="pages.length >= 2"><ul class="pagination">' +
        '<li ng-repeat="page in pages" ng-class="{active: page==currentPage}"><a ng-click="selectPage(page)">{{page}}</a></li>' +
        '</ul></nav>');
}]);


ng.module('smart-table')
  .constant('stConfig', {
    pagination: {
      template: 'template/smart-table/pagination.html',
      itemsByPage: 10,
      displayedPages: 5
    },
    search: {
      delay: 400 // ms
    },
    select: {
      mode: 'single',
      selectedClass: 'st-selected'
    },
    sort: {
      ascentClass: 'st-sort-ascent',
      descentClass: 'st-sort-descent',
      skipNatural: false
    },
    pipe: {
      delay: 100 //ms
    },
    searchType: {
      server: true
    }
  });
ng.module('smart-table')
  .controller('stTableController', ['$scope', '$parse', '$filter', '$attrs', 'stConfig', function StTableController ($scope, $parse, $filter, $attrs, stConfig) {
    var propertyName = $attrs.stTable;
    var localSearch = $attrs.localSearch =='true' || false;
    var displayGetter = $parse(propertyName);
    var displaySetter = displayGetter.assign;
    var safeGetter;
    var orderBy = $filter('orderBy');
    var filter = $filter('filter');
    var safeCopy = copyRefs(displayGetter($scope));
    var tableState = {
      sort: {},
      search: {},
      pagination: {
        start: 0
      },
      columns: []
    };
    var filtered;
    var pipeAfterSafeCopy = true;
    var ctrl = this;
    var lastSelected;
    var elements = {};

    function copyRefs (src) {
      return src ? [].concat(src) : [];
    }

    function updateSafeCopy () {
      safeCopy = copyRefs(safeGetter($scope));
      if (pipeAfterSafeCopy === true) {
        ctrl.pipe();
      }
    }

    if ($attrs.stSafeSrc) {
      safeGetter = $parse($attrs.stSafeSrc);
      $scope.$watch(function () {
        var safeSrc = safeGetter($scope);
        return safeSrc ? safeSrc.length : 0;

      }, function (newValue, oldValue) {
        if (newValue !== safeCopy.length) {
          updateSafeCopy();
        }
      });
      $scope.$watch(function () {
        return safeGetter($scope);
      }, function (newValue, oldValue) {
        if (newValue !== oldValue) {
          updateSafeCopy();
        }
      });
    }

    /**
     * sort the rows
     * @param {Function | String} predicate - function or string which will be used as predicate for the sorting
     * @param [reverse] - if you want to reverse the order
     */
    this.sortBy = function sortBy (predicate, reverse) {
      tableState.sort.predicate = predicate;
      tableState.sort.reverse = reverse === true;

      if (ng.isFunction(predicate)) {
        tableState.sort.functionName = predicate.name;
      } else {
        delete tableState.sort.functionName;
      }

      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * search matching rows
     * @param {String} input - the input string
     * @param {String} [predicate] - the property name against you want to check the match, otherwise it will search on all properties
     */
    this.search = function search (input, predicate) {
      var predicateObject = tableState.search.predicateObject || {};
      var prop = predicate ? predicate : '$';

      input = ng.isString(input) ? input.trim() : input;
      predicateObject[prop] = input;
      // to avoid to filter out null value
      if (!input) {
        delete predicateObject[prop];
      }
      tableState.search.predicateObject = predicateObject;
      tableState.pagination.start = 0;
      return this.pipe();
    };

    /**
     * this will chain the operations of sorting and filtering based on the current table state (sort options, filtering, ect)
     */
    this.pipe = function pipe () {
      if(localSearch) {
        this.localSearch();
      }
      else {
        this.serverSearch();
      }
      this.recalculateElements();
    };

    this.serverSearch = function serverSearch() {
      var self = this;
      var pagination = tableState.pagination;
      var params = {
        orderBy: tableState.sort.predicate,
        reverse: tableState.sort.reverse,
        filter: tableState.search.predicateObject? tableState.search.predicateObject.$ : undefined,
        offset: pagination.start,
        pageSize: pagination.number,
        columns: tableState.columns
      };

      $scope[$attrs.stSearchFn](params).then(function (res) {
        filtered = res[0].collection;
        var output = self.paginate(pagination, res[0].length);
        if(params.offset == pagination.start){
          displaySetter($scope, output || filtered);
        } else{
          params.offset = pagination.start;
          $scope[$attrs.stSearchFn](params).then(function (res){
            filtered = res[0].collection;
            displaySetter($scope, filtered);
          })
        }
      });
    };

    this.localSearch = function localSearch() {
      var self = this;
      var pagination = tableState.pagination;
      filtered = tableState.search.predicateObject ? filter(safeCopy, tableState.search.predicateObject) : safeCopy;
        if (tableState.sort.predicate) {
          filtered = orderBy(filtered, tableState.sort.predicate, tableState.sort.reverse);
        }
        var output = self.paginate(pagination, filtered.length);
        displaySetter($scope, output || filtered);
    };

    this.paginate = function paginate (pagination, collectionLength) {
      if (pagination.number !== undefined) {
        pagination.numberOfPages = collectionLength > 0 ? Math.ceil(collectionLength / pagination.number) : 1;
        pagination.start = pagination.start >= collectionLength ? (pagination.numberOfPages - 1) * pagination.number : pagination.start;
        if(localSearch){
          return filtered.slice(pagination.start, pagination.start + pagination.number);
        } else{
          return null;
        }
      }
      else {
        return [];
      }
    };

    /**
     * select a dataRow (it will add the attribute isSelected to the row object)
     * @param {Object} row - the row to select
     * @param {String} [mode] - "single" or "multiple" (multiple by default)
     */
    this.select = function select (row, mode) {
      var rows = copyRefs(displayGetter($scope));
      var index = rows.indexOf(row);
      if (index !== -1) {
        if (mode === 'single') {
          row.isSelected = row.isSelected !== true;
          if (lastSelected) {
            lastSelected.isSelected = false;
          }
          lastSelected = row.isSelected === true ? row : undefined;
        } else {
          rows[index].isSelected = !rows[index].isSelected;
        }
      }
    };

    /**
     * take a slice of the current sorted/filtered collection (pagination)
     *
     * @param {Number} start - start index of the slice
     * @param {Number} number - the number of item in the slice
     */
    this.slice = function splice (start, number) {
      tableState.pagination.start = start;
      tableState.pagination.number = number;
      return this.pipe();
    };

    /**
     * return the current state of the table
     * @returns {{sort: {}, search: {}, pagination: {start: number}}}
     */
    this.tableState = function getTableState () {
      return tableState;
    };

    this.getFilteredCollection = function getFilteredCollection () {
      return filtered || safeCopy;
    };

    /**
     * Use a different filter function than the angular FilterFilter
     * @param filterName the name under which the custom filter is registered
     */
    this.setFilterFunction = function setFilterFunction (filterName) {
      filter = $filter(filterName);
    };

    /**
     * Use a different function than the angular orderBy
     * @param sortFunctionName the name under which the custom order function is registered
     */
    this.setSortFunction = function setSortFunction (sortFunctionName) {
      orderBy = $filter(sortFunctionName);
    };

    /**
     * Usually when the safe copy is updated the pipe function is called.
     * Calling this method will prevent it, which is something required when using a custom pipe function
     */
    this.preventPipeOnWatch = function preventPipe () {
      pipeAfterSafeCopy = false;
    };

    this.getElements = function getElements() {
      return elements;
    };

    this.recalculateElements = function recalculateElements() {
      if(localSearch){
        elements.count = safeCopy.length;
      } else{
        $scope[$attrs.stSearchFn]({
          orderBy: tableState.sort.predicate,
          reverse: tableState.sort.reverse,
          filter: tableState.search.predicateObject? tableState.search.predicateObject.$ : undefined,
          offset: tableState.pagination.start,
          columns: tableState.columns
        }).then(function (res) {
          elements.count = res[0].length;
        });
      }
    };

  }])
  .directive('stTable', function () {
    return {
      restrict: 'A',
      controller: 'stTableController',
      link: function (scope, element, attr, ctrl) {

        if (attr.stSetFilter) {
          ctrl.setFilterFunction(attr.stSetFilter);
        }

        if (attr.stSetSort) {
          ctrl.setSortFunction(attr.stSetSort);
        }
      }
    };
  });

ng.module('smart-table')
  .directive('stSearch', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        var tableCtrl = ctrl;
        var promise = null;
        var throttle = attr.stDelay || stConfig.search.delay;

        attr.$observe('stSearch', function (newValue, oldValue) {
          var input = element[0].value;
          if (newValue !== oldValue && input) {
            ctrl.tableState().search = {};
            tableCtrl.search(input, newValue);
          }
        });

        //table state -> view
        scope.$watch(function () {
          return ctrl.tableState().search;
        }, function (newValue, oldValue) {
          var predicateExpression = attr.stSearch || '$';
          if (newValue.predicateObject && newValue.predicateObject[predicateExpression] !== element[0].value) {
            element[0].value = newValue.predicateObject[predicateExpression] || '';
          }
        }, true);

        // view -> table state
        element.bind('input', function (evt) {
          evt = evt.originalEvent || evt;
          if (promise !== null) {
            $timeout.cancel(promise);
          }

          promise = $timeout(function () {
            tableCtrl.search(evt.target.value, attr.stSearch || '');
            promise = null;
          }, throttle);
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSearchButton', ['stConfig', '$timeout', function (stConfig, $timeout) {
    return {
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {
        element.bind('click', function (evt) {
          if(attr.type == 'button'){
            ctrl.pipe();
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSelectRow', ['stConfig', function (stConfig) {
    return {
      restrict: 'A',
      require: '^stTable',
      scope: {
        row: '=stSelectRow'
      },
      link: function (scope, element, attr, ctrl) {
        var mode = attr.stSelectMode || stConfig.select.mode;
        element.bind('click', function () {
          scope.$apply(function () {
            ctrl.select(scope.row, mode);
          });
        });

        scope.$watch('row.isSelected', function (newValue) {
          if (newValue === true) {
            element.addClass(stConfig.select.selectedClass);
          } else {
            element.removeClass(stConfig.select.selectedClass);
          }
        });
      }
    };
  }]);

ng.module('smart-table')
  .directive('stSort', ['stConfig', '$parse', function (stConfig, $parse) {
    return {
      restrict: 'A',
      require: '^stTable',
      link: function (scope, element, attr, ctrl) {

        var predicate = attr.stSort;
        var getter = $parse(predicate);
        var index = 0;
        var classAscent = attr.stClassAscent || stConfig.sort.ascentClass;
        var classDescent = attr.stClassDescent || stConfig.sort.descentClass;
        var stateClasses = [classAscent, classDescent];
        var sortDefault;
        var skipNatural = attr.stSkipNatural !== undefined ? attr.stSkipNatural : stConfig.skipNatural;

        if (attr.stSortDefault) {
          sortDefault = scope.$eval(attr.stSortDefault) !== undefined ? scope.$eval(attr.stSortDefault) : attr.stSortDefault;
        }

        ctrl.tableState().columns.push(predicate);

        //view --> table state
        function sort () {
          index++;
          predicate = ng.isFunction(getter(scope)) ? getter(scope) : attr.stSort;
          if (index % 3 === 0 && !!skipNatural !== true) {
            //manual reset
            index = 0;
            ctrl.tableState().sort = {};
            ctrl.tableState().pagination.start = 0;
            ctrl.pipe();
          } else {
            ctrl.sortBy(predicate, index % 2 === 0);
          }
        }

        element.bind('click', function sortClick () {
          if (predicate) {
            scope.$apply(sort);
          }
        });

        if (sortDefault) {
          index = sortDefault === 'reverse' ? 1 : 0;
          sort();
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().sort;
        }, function (newValue) {
          if (newValue.predicate !== predicate) {
            index = 0;
            element
              .removeClass(classAscent)
              .removeClass(classDescent);
          } else {
            index = newValue.reverse === true ? 2 : 1;
            element
              .removeClass(stateClasses[index % 2])
              .addClass(stateClasses[index - 1]);
          }
        }, true);
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPagination', ['stConfig', function (stConfig) {
    return {
      restrict: 'EA',
      require: '^stTable',
      scope: {
        stItemsByPage: '=?',
        stDisplayedPages: '=?',
        stPageChange: '&'
      },
      templateUrl: function (element, attrs) {
        if (attrs.stTemplate) {
          return attrs.stTemplate;
        }
        return stConfig.pagination.template;
      },
      link: function (scope, element, attrs, ctrl) {

        scope.stItemsByPage = scope.stItemsByPage ? +(scope.stItemsByPage) : stConfig.pagination.itemsByPage;
        scope.stDisplayedPages = scope.stDisplayedPages ? +(scope.stDisplayedPages) : stConfig.pagination.displayedPages;

        scope.currentPage = 1;
        scope.pages = [];
        scope.elements = ctrl.getElements();

        function redraw () {
          var paginationState = ctrl.tableState().pagination;
          var start = 1;
          var end;
          var i;
          var prevPage = scope.currentPage;
          scope.currentPage = Math.floor(paginationState.start / paginationState.number) + 1;

          start = Math.max(start, scope.currentPage - Math.abs(Math.floor(scope.stDisplayedPages / 2)));
          end = start + scope.stDisplayedPages;

          if (end > paginationState.numberOfPages) {
            end = paginationState.numberOfPages + 1;
            start = Math.max(1, end - scope.stDisplayedPages);
          }

          scope.pages = [];
          scope.numPages = paginationState.numberOfPages;

          if (paginationState.numberOfPages){
            for (i = start; i < end; i++) {
              scope.pages.push(i);
            }
          }

          if (prevPage !== scope.currentPage) {
            scope.stPageChange({newPage: scope.currentPage});
          }
        }

        //table state --> view
        scope.$watch(function () {
          return ctrl.tableState().pagination;
        }, redraw, true);

        //scope --> table state  (--> view)
        scope.$watch('stItemsByPage', function (newValue, oldValue) {
          if (newValue !== oldValue) {
            scope.selectPage(1);
          }
        });

        scope.$watch('stDisplayedPages', redraw);

        //view -> table state
        scope.selectPage = function (page) {
          if (page > 0 && page <= scope.numPages) {
            ctrl.slice((page - 1) * scope.stItemsByPage, scope.stItemsByPage);
          }
        };

        if (!ctrl.tableState().pagination.number) {
          ctrl.slice(0, scope.stItemsByPage);
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stPipe', ['stConfig', '$timeout', function (config, $timeout) {
    return {
      require: 'stTable',
      scope: {
        stPipe: '='
      },
      link: {

        pre: function (scope, element, attrs, ctrl) {

          var pipePromise = null;

          if (ng.isFunction(scope.stPipe)) {
            ctrl.preventPipeOnWatch();
            ctrl.pipe = function () {

              if (pipePromise !== null) {
                $timeout.cancel(pipePromise)
              }

              pipePromise = $timeout(function () {
                scope.stPipe(ctrl.tableState(), ctrl);
              }, config.pipe.delay);

              return pipePromise;
            }
          }
        },

        post: function (scope, element, attrs, ctrl) {
          ctrl.pipe();
        }
      }
    };
  }]);

ng.module('smart-table')
  .directive('stResetFilter', ['$parse', function ($parse) {
        return {
            restrict: 'A',
            require: '^stTable',
            link: function (scope, element, attr, ctrl) {
                var tableCtrl = ctrl;
                var fn = $parse(attr['stResetFilter']);

                element.on('click', function (event) {
                    ctrl.tableState().search = {};
                    tableCtrl.search('', '');
                    scope.$apply(function () {
                        fn(scope, {
                            $event: event
                        })
                    });
                });
            }
        };
  }]);
})(angular);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdENvbmZpZy5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VhcmNoQnV0dG9uLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL3N0UmVzZXRGaWx0ZXIuanMiLCJzcmMvYm90dG9tLnR4dCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDbkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNsRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcEJBIiwiZmlsZSI6InNtYXJ0LXRhYmxlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIChuZywgdW5kZWZpbmVkKXtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScsIFtdKS5ydW4oWyckdGVtcGxhdGVDYWNoZScsIGZ1bmN0aW9uICgkdGVtcGxhdGVDYWNoZSkge1xyXG4gICAgJHRlbXBsYXRlQ2FjaGUucHV0KCd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxyXG4gICAgICAgICc8bmF2IG5nLWlmPVwicGFnZXMubGVuZ3RoID49IDJcIj48dWwgY2xhc3M9XCJwYWdpbmF0aW9uXCI+JyArXHJcbiAgICAgICAgJzxsaSBuZy1yZXBlYXQ9XCJwYWdlIGluIHBhZ2VzXCIgbmctY2xhc3M9XCJ7YWN0aXZlOiBwYWdlPT1jdXJyZW50UGFnZX1cIj48YSBuZy1jbGljaz1cInNlbGVjdFBhZ2UocGFnZSlcIj57e3BhZ2V9fTwvYT48L2xpPicgK1xyXG4gICAgICAgICc8L3VsPjwvbmF2PicpO1xyXG59XSk7XHJcblxyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuY29uc3RhbnQoJ3N0Q29uZmlnJywge1xyXG4gICAgcGFnaW5hdGlvbjoge1xyXG4gICAgICB0ZW1wbGF0ZTogJ3RlbXBsYXRlL3NtYXJ0LXRhYmxlL3BhZ2luYXRpb24uaHRtbCcsXHJcbiAgICAgIGl0ZW1zQnlQYWdlOiAxMCxcclxuICAgICAgZGlzcGxheWVkUGFnZXM6IDVcclxuICAgIH0sXHJcbiAgICBzZWFyY2g6IHtcclxuICAgICAgZGVsYXk6IDQwMCAvLyBtc1xyXG4gICAgfSxcclxuICAgIHNlbGVjdDoge1xyXG4gICAgICBtb2RlOiAnc2luZ2xlJyxcclxuICAgICAgc2VsZWN0ZWRDbGFzczogJ3N0LXNlbGVjdGVkJ1xyXG4gICAgfSxcclxuICAgIHNvcnQ6IHtcclxuICAgICAgYXNjZW50Q2xhc3M6ICdzdC1zb3J0LWFzY2VudCcsXHJcbiAgICAgIGRlc2NlbnRDbGFzczogJ3N0LXNvcnQtZGVzY2VudCcsXHJcbiAgICAgIHNraXBOYXR1cmFsOiBmYWxzZVxyXG4gICAgfSxcclxuICAgIHBpcGU6IHtcclxuICAgICAgZGVsYXk6IDEwMCAvL21zXHJcbiAgICB9LFxyXG4gICAgc2VhcmNoVHlwZToge1xyXG4gICAgICBzZXJ2ZXI6IHRydWVcclxuICAgIH1cclxuICB9KTsiLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuY29udHJvbGxlcignc3RUYWJsZUNvbnRyb2xsZXInLCBbJyRzY29wZScsICckcGFyc2UnLCAnJGZpbHRlcicsICckYXR0cnMnLCAnc3RDb25maWcnLCBmdW5jdGlvbiBTdFRhYmxlQ29udHJvbGxlciAoJHNjb3BlLCAkcGFyc2UsICRmaWx0ZXIsICRhdHRycywgc3RDb25maWcpIHtcclxuICAgIHZhciBwcm9wZXJ0eU5hbWUgPSAkYXR0cnMuc3RUYWJsZTtcclxuICAgIHZhciBsb2NhbFNlYXJjaCA9ICRhdHRycy5sb2NhbFNlYXJjaCA9PSd0cnVlJyB8fCBmYWxzZTtcclxuICAgIHZhciBkaXNwbGF5R2V0dGVyID0gJHBhcnNlKHByb3BlcnR5TmFtZSk7XHJcbiAgICB2YXIgZGlzcGxheVNldHRlciA9IGRpc3BsYXlHZXR0ZXIuYXNzaWduO1xyXG4gICAgdmFyIHNhZmVHZXR0ZXI7XHJcbiAgICB2YXIgb3JkZXJCeSA9ICRmaWx0ZXIoJ29yZGVyQnknKTtcclxuICAgIHZhciBmaWx0ZXIgPSAkZmlsdGVyKCdmaWx0ZXInKTtcclxuICAgIHZhciBzYWZlQ29weSA9IGNvcHlSZWZzKGRpc3BsYXlHZXR0ZXIoJHNjb3BlKSk7XHJcbiAgICB2YXIgdGFibGVTdGF0ZSA9IHtcclxuICAgICAgc29ydDoge30sXHJcbiAgICAgIHNlYXJjaDoge30sXHJcbiAgICAgIHBhZ2luYXRpb246IHtcclxuICAgICAgICBzdGFydDogMFxyXG4gICAgICB9LFxyXG4gICAgICBjb2x1bW5zOiBbXVxyXG4gICAgfTtcclxuICAgIHZhciBmaWx0ZXJlZDtcclxuICAgIHZhciBwaXBlQWZ0ZXJTYWZlQ29weSA9IHRydWU7XHJcbiAgICB2YXIgY3RybCA9IHRoaXM7XHJcbiAgICB2YXIgbGFzdFNlbGVjdGVkO1xyXG4gICAgdmFyIGVsZW1lbnRzID0ge307XHJcblxyXG4gICAgZnVuY3Rpb24gY29weVJlZnMgKHNyYykge1xyXG4gICAgICByZXR1cm4gc3JjID8gW10uY29uY2F0KHNyYykgOiBbXTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiB1cGRhdGVTYWZlQ29weSAoKSB7XHJcbiAgICAgIHNhZmVDb3B5ID0gY29weVJlZnMoc2FmZUdldHRlcigkc2NvcGUpKTtcclxuICAgICAgaWYgKHBpcGVBZnRlclNhZmVDb3B5ID09PSB0cnVlKSB7XHJcbiAgICAgICAgY3RybC5waXBlKCk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoJGF0dHJzLnN0U2FmZVNyYykge1xyXG4gICAgICBzYWZlR2V0dGVyID0gJHBhcnNlKCRhdHRycy5zdFNhZmVTcmMpO1xyXG4gICAgICAkc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICB2YXIgc2FmZVNyYyA9IHNhZmVHZXR0ZXIoJHNjb3BlKTtcclxuICAgICAgICByZXR1cm4gc2FmZVNyYyA/IHNhZmVTcmMubGVuZ3RoIDogMDtcclxuXHJcbiAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcclxuICAgICAgICBpZiAobmV3VmFsdWUgIT09IHNhZmVDb3B5Lmxlbmd0aCkge1xyXG4gICAgICAgICAgdXBkYXRlU2FmZUNvcHkoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgICAkc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gc2FmZUdldHRlcigkc2NvcGUpO1xyXG4gICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xyXG4gICAgICAgICAgdXBkYXRlU2FmZUNvcHkoKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogc29ydCB0aGUgcm93c1xyXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbiB8IFN0cmluZ30gcHJlZGljYXRlIC0gZnVuY3Rpb24gb3Igc3RyaW5nIHdoaWNoIHdpbGwgYmUgdXNlZCBhcyBwcmVkaWNhdGUgZm9yIHRoZSBzb3J0aW5nXHJcbiAgICAgKiBAcGFyYW0gW3JldmVyc2VdIC0gaWYgeW91IHdhbnQgdG8gcmV2ZXJzZSB0aGUgb3JkZXJcclxuICAgICAqL1xyXG4gICAgdGhpcy5zb3J0QnkgPSBmdW5jdGlvbiBzb3J0QnkgKHByZWRpY2F0ZSwgcmV2ZXJzZSkge1xyXG4gICAgICB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlID0gcHJlZGljYXRlO1xyXG4gICAgICB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSA9IHJldmVyc2UgPT09IHRydWU7XHJcblxyXG4gICAgICBpZiAobmcuaXNGdW5jdGlvbihwcmVkaWNhdGUpKSB7XHJcbiAgICAgICAgdGFibGVTdGF0ZS5zb3J0LmZ1bmN0aW9uTmFtZSA9IHByZWRpY2F0ZS5uYW1lO1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGRlbGV0ZSB0YWJsZVN0YXRlLnNvcnQuZnVuY3Rpb25OYW1lO1xyXG4gICAgICB9XHJcblxyXG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xyXG4gICAgICByZXR1cm4gdGhpcy5waXBlKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogc2VhcmNoIG1hdGNoaW5nIHJvd3NcclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBpbnB1dCAtIHRoZSBpbnB1dCBzdHJpbmdcclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbcHJlZGljYXRlXSAtIHRoZSBwcm9wZXJ0eSBuYW1lIGFnYWluc3QgeW91IHdhbnQgdG8gY2hlY2sgdGhlIG1hdGNoLCBvdGhlcndpc2UgaXQgd2lsbCBzZWFyY2ggb24gYWxsIHByb3BlcnRpZXNcclxuICAgICAqL1xyXG4gICAgdGhpcy5zZWFyY2ggPSBmdW5jdGlvbiBzZWFyY2ggKGlucHV0LCBwcmVkaWNhdGUpIHtcclxuICAgICAgdmFyIHByZWRpY2F0ZU9iamVjdCA9IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCB8fCB7fTtcclxuICAgICAgdmFyIHByb3AgPSBwcmVkaWNhdGUgPyBwcmVkaWNhdGUgOiAnJCc7XHJcblxyXG4gICAgICBpbnB1dCA9IG5nLmlzU3RyaW5nKGlucHV0KSA/IGlucHV0LnRyaW0oKSA6IGlucHV0O1xyXG4gICAgICBwcmVkaWNhdGVPYmplY3RbcHJvcF0gPSBpbnB1dDtcclxuICAgICAgLy8gdG8gYXZvaWQgdG8gZmlsdGVyIG91dCBudWxsIHZhbHVlXHJcbiAgICAgIGlmICghaW5wdXQpIHtcclxuICAgICAgICBkZWxldGUgcHJlZGljYXRlT2JqZWN0W3Byb3BdO1xyXG4gICAgICB9XHJcbiAgICAgIHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCA9IHByZWRpY2F0ZU9iamVjdDtcclxuICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gMDtcclxuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIHRoaXMgd2lsbCBjaGFpbiB0aGUgb3BlcmF0aW9ucyBvZiBzb3J0aW5nIGFuZCBmaWx0ZXJpbmcgYmFzZWQgb24gdGhlIGN1cnJlbnQgdGFibGUgc3RhdGUgKHNvcnQgb3B0aW9ucywgZmlsdGVyaW5nLCBlY3QpXHJcbiAgICAgKi9cclxuICAgIHRoaXMucGlwZSA9IGZ1bmN0aW9uIHBpcGUgKCkge1xyXG4gICAgICBpZihsb2NhbFNlYXJjaCkge1xyXG4gICAgICAgIHRoaXMubG9jYWxTZWFyY2goKTtcclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICB0aGlzLnNlcnZlclNlYXJjaCgpO1xyXG4gICAgICB9XHJcbiAgICAgIHRoaXMucmVjYWxjdWxhdGVFbGVtZW50cygpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNlcnZlclNlYXJjaCA9IGZ1bmN0aW9uIHNlcnZlclNlYXJjaCgpIHtcclxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICB2YXIgcGFnaW5hdGlvbiA9IHRhYmxlU3RhdGUucGFnaW5hdGlvbjtcclxuICAgICAgdmFyIHBhcmFtcyA9IHtcclxuICAgICAgICBvcmRlckJ5OiB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlLFxyXG4gICAgICAgIHJldmVyc2U6IHRhYmxlU3RhdGUuc29ydC5yZXZlcnNlLFxyXG4gICAgICAgIGZpbHRlcjogdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0PyB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QuJCA6IHVuZGVmaW5lZCxcclxuICAgICAgICBvZmZzZXQ6IHBhZ2luYXRpb24uc3RhcnQsXHJcbiAgICAgICAgcGFnZVNpemU6IHBhZ2luYXRpb24ubnVtYmVyLFxyXG4gICAgICAgIGNvbHVtbnM6IHRhYmxlU3RhdGUuY29sdW1uc1xyXG4gICAgICB9O1xyXG5cclxuICAgICAgJHNjb3BlWyRhdHRycy5zdFNlYXJjaEZuXShwYXJhbXMpLnRoZW4oZnVuY3Rpb24gKHJlcykge1xyXG4gICAgICAgIGZpbHRlcmVkID0gcmVzWzBdLmNvbGxlY3Rpb247XHJcbiAgICAgICAgdmFyIG91dHB1dCA9IHNlbGYucGFnaW5hdGUocGFnaW5hdGlvbiwgcmVzWzBdLmxlbmd0aCk7XHJcbiAgICAgICAgaWYocGFyYW1zLm9mZnNldCA9PSBwYWdpbmF0aW9uLnN0YXJ0KXtcclxuICAgICAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBvdXRwdXQgfHwgZmlsdGVyZWQpO1xyXG4gICAgICAgIH0gZWxzZXtcclxuICAgICAgICAgIHBhcmFtcy5vZmZzZXQgPSBwYWdpbmF0aW9uLnN0YXJ0O1xyXG4gICAgICAgICAgJHNjb3BlWyRhdHRycy5zdFNlYXJjaEZuXShwYXJhbXMpLnRoZW4oZnVuY3Rpb24gKHJlcyl7XHJcbiAgICAgICAgICAgIGZpbHRlcmVkID0gcmVzWzBdLmNvbGxlY3Rpb247XHJcbiAgICAgICAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBmaWx0ZXJlZCk7XHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH1cclxuICAgICAgfSk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMubG9jYWxTZWFyY2ggPSBmdW5jdGlvbiBsb2NhbFNlYXJjaCgpIHtcclxuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgICB2YXIgcGFnaW5hdGlvbiA9IHRhYmxlU3RhdGUucGFnaW5hdGlvbjtcclxuICAgICAgZmlsdGVyZWQgPSB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPyBmaWx0ZXIoc2FmZUNvcHksIHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdCkgOiBzYWZlQ29weTtcclxuICAgICAgICBpZiAodGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSkge1xyXG4gICAgICAgICAgZmlsdGVyZWQgPSBvcmRlckJ5KGZpbHRlcmVkLCB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlLCB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHZhciBvdXRwdXQgPSBzZWxmLnBhZ2luYXRlKHBhZ2luYXRpb24sIGZpbHRlcmVkLmxlbmd0aCk7XHJcbiAgICAgICAgZGlzcGxheVNldHRlcigkc2NvcGUsIG91dHB1dCB8fCBmaWx0ZXJlZCk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMucGFnaW5hdGUgPSBmdW5jdGlvbiBwYWdpbmF0ZSAocGFnaW5hdGlvbiwgY29sbGVjdGlvbkxlbmd0aCkge1xyXG4gICAgICBpZiAocGFnaW5hdGlvbi5udW1iZXIgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyA9IGNvbGxlY3Rpb25MZW5ndGggPiAwID8gTWF0aC5jZWlsKGNvbGxlY3Rpb25MZW5ndGggLyBwYWdpbmF0aW9uLm51bWJlcikgOiAxO1xyXG4gICAgICAgIHBhZ2luYXRpb24uc3RhcnQgPSBwYWdpbmF0aW9uLnN0YXJ0ID49IGNvbGxlY3Rpb25MZW5ndGggPyAocGFnaW5hdGlvbi5udW1iZXJPZlBhZ2VzIC0gMSkgKiBwYWdpbmF0aW9uLm51bWJlciA6IHBhZ2luYXRpb24uc3RhcnQ7XHJcbiAgICAgICAgaWYobG9jYWxTZWFyY2gpe1xyXG4gICAgICAgICAgcmV0dXJuIGZpbHRlcmVkLnNsaWNlKHBhZ2luYXRpb24uc3RhcnQsIHBhZ2luYXRpb24uc3RhcnQgKyBwYWdpbmF0aW9uLm51bWJlcik7XHJcbiAgICAgICAgfSBlbHNle1xyXG4gICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBbXTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIHNlbGVjdCBhIGRhdGFSb3cgKGl0IHdpbGwgYWRkIHRoZSBhdHRyaWJ1dGUgaXNTZWxlY3RlZCB0byB0aGUgcm93IG9iamVjdClcclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSByb3cgLSB0aGUgcm93IHRvIHNlbGVjdFxyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IFttb2RlXSAtIFwic2luZ2xlXCIgb3IgXCJtdWx0aXBsZVwiIChtdWx0aXBsZSBieSBkZWZhdWx0KVxyXG4gICAgICovXHJcbiAgICB0aGlzLnNlbGVjdCA9IGZ1bmN0aW9uIHNlbGVjdCAocm93LCBtb2RlKSB7XHJcbiAgICAgIHZhciByb3dzID0gY29weVJlZnMoZGlzcGxheUdldHRlcigkc2NvcGUpKTtcclxuICAgICAgdmFyIGluZGV4ID0gcm93cy5pbmRleE9mKHJvdyk7XHJcbiAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcclxuICAgICAgICBpZiAobW9kZSA9PT0gJ3NpbmdsZScpIHtcclxuICAgICAgICAgIHJvdy5pc1NlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgIT09IHRydWU7XHJcbiAgICAgICAgICBpZiAobGFzdFNlbGVjdGVkKSB7XHJcbiAgICAgICAgICAgIGxhc3RTZWxlY3RlZC5pc1NlbGVjdGVkID0gZmFsc2U7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBsYXN0U2VsZWN0ZWQgPSByb3cuaXNTZWxlY3RlZCA9PT0gdHJ1ZSA/IHJvdyA6IHVuZGVmaW5lZDtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcm93c1tpbmRleF0uaXNTZWxlY3RlZCA9ICFyb3dzW2luZGV4XS5pc1NlbGVjdGVkO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIHRha2UgYSBzbGljZSBvZiB0aGUgY3VycmVudCBzb3J0ZWQvZmlsdGVyZWQgY29sbGVjdGlvbiAocGFnaW5hdGlvbilcclxuICAgICAqXHJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3RhcnQgLSBzdGFydCBpbmRleCBvZiB0aGUgc2xpY2VcclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBudW1iZXIgLSB0aGUgbnVtYmVyIG9mIGl0ZW0gaW4gdGhlIHNsaWNlXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc2xpY2UgPSBmdW5jdGlvbiBzcGxpY2UgKHN0YXJ0LCBudW1iZXIpIHtcclxuICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gc3RhcnQ7XHJcbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5udW1iZXIgPSBudW1iZXI7XHJcbiAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiByZXR1cm4gdGhlIGN1cnJlbnQgc3RhdGUgb2YgdGhlIHRhYmxlXHJcbiAgICAgKiBAcmV0dXJucyB7e3NvcnQ6IHt9LCBzZWFyY2g6IHt9LCBwYWdpbmF0aW9uOiB7c3RhcnQ6IG51bWJlcn19fVxyXG4gICAgICovXHJcbiAgICB0aGlzLnRhYmxlU3RhdGUgPSBmdW5jdGlvbiBnZXRUYWJsZVN0YXRlICgpIHtcclxuICAgICAgcmV0dXJuIHRhYmxlU3RhdGU7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0RmlsdGVyZWRDb2xsZWN0aW9uID0gZnVuY3Rpb24gZ2V0RmlsdGVyZWRDb2xsZWN0aW9uICgpIHtcclxuICAgICAgcmV0dXJuIGZpbHRlcmVkIHx8IHNhZmVDb3B5O1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZSBhIGRpZmZlcmVudCBmaWx0ZXIgZnVuY3Rpb24gdGhhbiB0aGUgYW5ndWxhciBGaWx0ZXJGaWx0ZXJcclxuICAgICAqIEBwYXJhbSBmaWx0ZXJOYW1lIHRoZSBuYW1lIHVuZGVyIHdoaWNoIHRoZSBjdXN0b20gZmlsdGVyIGlzIHJlZ2lzdGVyZWRcclxuICAgICAqL1xyXG4gICAgdGhpcy5zZXRGaWx0ZXJGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldEZpbHRlckZ1bmN0aW9uIChmaWx0ZXJOYW1lKSB7XHJcbiAgICAgIGZpbHRlciA9ICRmaWx0ZXIoZmlsdGVyTmFtZSk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogVXNlIGEgZGlmZmVyZW50IGZ1bmN0aW9uIHRoYW4gdGhlIGFuZ3VsYXIgb3JkZXJCeVxyXG4gICAgICogQHBhcmFtIHNvcnRGdW5jdGlvbk5hbWUgdGhlIG5hbWUgdW5kZXIgd2hpY2ggdGhlIGN1c3RvbSBvcmRlciBmdW5jdGlvbiBpcyByZWdpc3RlcmVkXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc2V0U29ydEZ1bmN0aW9uID0gZnVuY3Rpb24gc2V0U29ydEZ1bmN0aW9uIChzb3J0RnVuY3Rpb25OYW1lKSB7XHJcbiAgICAgIG9yZGVyQnkgPSAkZmlsdGVyKHNvcnRGdW5jdGlvbk5hbWUpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzdWFsbHkgd2hlbiB0aGUgc2FmZSBjb3B5IGlzIHVwZGF0ZWQgdGhlIHBpcGUgZnVuY3Rpb24gaXMgY2FsbGVkLlxyXG4gICAgICogQ2FsbGluZyB0aGlzIG1ldGhvZCB3aWxsIHByZXZlbnQgaXQsIHdoaWNoIGlzIHNvbWV0aGluZyByZXF1aXJlZCB3aGVuIHVzaW5nIGEgY3VzdG9tIHBpcGUgZnVuY3Rpb25cclxuICAgICAqL1xyXG4gICAgdGhpcy5wcmV2ZW50UGlwZU9uV2F0Y2ggPSBmdW5jdGlvbiBwcmV2ZW50UGlwZSAoKSB7XHJcbiAgICAgIHBpcGVBZnRlclNhZmVDb3B5ID0gZmFsc2U7XHJcbiAgICB9O1xyXG5cclxuICAgIHRoaXMuZ2V0RWxlbWVudHMgPSBmdW5jdGlvbiBnZXRFbGVtZW50cygpIHtcclxuICAgICAgcmV0dXJuIGVsZW1lbnRzO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnJlY2FsY3VsYXRlRWxlbWVudHMgPSBmdW5jdGlvbiByZWNhbGN1bGF0ZUVsZW1lbnRzKCkge1xyXG4gICAgICBpZihsb2NhbFNlYXJjaCl7XHJcbiAgICAgICAgZWxlbWVudHMuY291bnQgPSBzYWZlQ29weS5sZW5ndGg7XHJcbiAgICAgIH0gZWxzZXtcclxuICAgICAgICAkc2NvcGVbJGF0dHJzLnN0U2VhcmNoRm5dKHtcclxuICAgICAgICAgIG9yZGVyQnk6IHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUsXHJcbiAgICAgICAgICByZXZlcnNlOiB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSxcclxuICAgICAgICAgIGZpbHRlcjogdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0PyB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QuJCA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgIG9mZnNldDogdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0LFxyXG4gICAgICAgICAgY29sdW1uczogdGFibGVTdGF0ZS5jb2x1bW5zXHJcbiAgICAgICAgfSkudGhlbihmdW5jdGlvbiAocmVzKSB7XHJcbiAgICAgICAgICBlbGVtZW50cy5jb3VudCA9IHJlc1swXS5sZW5ndGg7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gIH1dKVxyXG4gIC5kaXJlY3RpdmUoJ3N0VGFibGUnLCBmdW5jdGlvbiAoKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICBjb250cm9sbGVyOiAnc3RUYWJsZUNvbnRyb2xsZXInLFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgaWYgKGF0dHIuc3RTZXRGaWx0ZXIpIHtcclxuICAgICAgICAgIGN0cmwuc2V0RmlsdGVyRnVuY3Rpb24oYXR0ci5zdFNldEZpbHRlcik7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoYXR0ci5zdFNldFNvcnQpIHtcclxuICAgICAgICAgIGN0cmwuc2V0U29ydEZ1bmN0aW9uKGF0dHIuc3RTZXRTb3J0KTtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0U2VhcmNoJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChzdENvbmZpZywgJHRpbWVvdXQpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXHJcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xyXG4gICAgICAgIHZhciB0YWJsZUN0cmwgPSBjdHJsO1xyXG4gICAgICAgIHZhciBwcm9taXNlID0gbnVsbDtcclxuICAgICAgICB2YXIgdGhyb3R0bGUgPSBhdHRyLnN0RGVsYXkgfHwgc3RDb25maWcuc2VhcmNoLmRlbGF5O1xyXG5cclxuICAgICAgICBhdHRyLiRvYnNlcnZlKCdzdFNlYXJjaCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcclxuICAgICAgICAgIHZhciBpbnB1dCA9IGVsZW1lbnRbMF0udmFsdWU7XHJcbiAgICAgICAgICBpZiAobmV3VmFsdWUgIT09IG9sZFZhbHVlICYmIGlucHV0KSB7XHJcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaCA9IHt9O1xyXG4gICAgICAgICAgICB0YWJsZUN0cmwuc2VhcmNoKGlucHV0LCBuZXdWYWx1ZSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vdGFibGUgc3RhdGUgLT4gdmlld1xyXG4gICAgICAgIHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICByZXR1cm4gY3RybC50YWJsZVN0YXRlKCkuc2VhcmNoO1xyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSwgb2xkVmFsdWUpIHtcclxuICAgICAgICAgIHZhciBwcmVkaWNhdGVFeHByZXNzaW9uID0gYXR0ci5zdFNlYXJjaCB8fCAnJCc7XHJcbiAgICAgICAgICBpZiAobmV3VmFsdWUucHJlZGljYXRlT2JqZWN0ICYmIG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSAhPT0gZWxlbWVudFswXS52YWx1ZSkge1xyXG4gICAgICAgICAgICBlbGVtZW50WzBdLnZhbHVlID0gbmV3VmFsdWUucHJlZGljYXRlT2JqZWN0W3ByZWRpY2F0ZUV4cHJlc3Npb25dIHx8ICcnO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sIHRydWUpO1xyXG5cclxuICAgICAgICAvLyB2aWV3IC0+IHRhYmxlIHN0YXRlXHJcbiAgICAgICAgZWxlbWVudC5iaW5kKCdpbnB1dCcsIGZ1bmN0aW9uIChldnQpIHtcclxuICAgICAgICAgIGV2dCA9IGV2dC5vcmlnaW5hbEV2ZW50IHx8IGV2dDtcclxuICAgICAgICAgIGlmIChwcm9taXNlICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwcm9taXNlKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBwcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB0YWJsZUN0cmwuc2VhcmNoKGV2dC50YXJnZXQudmFsdWUsIGF0dHIuc3RTZWFyY2ggfHwgJycpO1xyXG4gICAgICAgICAgICBwcm9taXNlID0gbnVsbDtcclxuICAgICAgICAgIH0sIHRocm90dGxlKTtcclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0U2VhcmNoQnV0dG9uJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChzdENvbmZpZywgJHRpbWVvdXQpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXHJcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiAoZXZ0KSB7XHJcbiAgICAgICAgICBpZihhdHRyLnR5cGUgPT0gJ2J1dHRvbicpe1xyXG4gICAgICAgICAgICBjdHJsLnBpcGUoKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0U2VsZWN0Um93JywgWydzdENvbmZpZycsIGZ1bmN0aW9uIChzdENvbmZpZykge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgc2NvcGU6IHtcclxuICAgICAgICByb3c6ICc9c3RTZWxlY3RSb3cnXHJcbiAgICAgIH0sXHJcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0ciwgY3RybCkge1xyXG4gICAgICAgIHZhciBtb2RlID0gYXR0ci5zdFNlbGVjdE1vZGUgfHwgc3RDb25maWcuc2VsZWN0Lm1vZGU7XHJcbiAgICAgICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGN0cmwuc2VsZWN0KHNjb3BlLnJvdywgbW9kZSk7XHJcbiAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKCdyb3cuaXNTZWxlY3RlZCcsIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSB0cnVlKSB7XHJcbiAgICAgICAgICAgIGVsZW1lbnQuYWRkQ2xhc3Moc3RDb25maWcuc2VsZWN0LnNlbGVjdGVkQ2xhc3MpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVDbGFzcyhzdENvbmZpZy5zZWxlY3Quc2VsZWN0ZWRDbGFzcyk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNvcnQnLCBbJ3N0Q29uZmlnJywgJyRwYXJzZScsIGZ1bmN0aW9uIChzdENvbmZpZywgJHBhcnNlKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgdmFyIHByZWRpY2F0ZSA9IGF0dHIuc3RTb3J0O1xyXG4gICAgICAgIHZhciBnZXR0ZXIgPSAkcGFyc2UocHJlZGljYXRlKTtcclxuICAgICAgICB2YXIgaW5kZXggPSAwO1xyXG4gICAgICAgIHZhciBjbGFzc0FzY2VudCA9IGF0dHIuc3RDbGFzc0FzY2VudCB8fCBzdENvbmZpZy5zb3J0LmFzY2VudENsYXNzO1xyXG4gICAgICAgIHZhciBjbGFzc0Rlc2NlbnQgPSBhdHRyLnN0Q2xhc3NEZXNjZW50IHx8IHN0Q29uZmlnLnNvcnQuZGVzY2VudENsYXNzO1xyXG4gICAgICAgIHZhciBzdGF0ZUNsYXNzZXMgPSBbY2xhc3NBc2NlbnQsIGNsYXNzRGVzY2VudF07XHJcbiAgICAgICAgdmFyIHNvcnREZWZhdWx0O1xyXG4gICAgICAgIHZhciBza2lwTmF0dXJhbCA9IGF0dHIuc3RTa2lwTmF0dXJhbCAhPT0gdW5kZWZpbmVkID8gYXR0ci5zdFNraXBOYXR1cmFsIDogc3RDb25maWcuc2tpcE5hdHVyYWw7XHJcblxyXG4gICAgICAgIGlmIChhdHRyLnN0U29ydERlZmF1bHQpIHtcclxuICAgICAgICAgIHNvcnREZWZhdWx0ID0gc2NvcGUuJGV2YWwoYXR0ci5zdFNvcnREZWZhdWx0KSAhPT0gdW5kZWZpbmVkID8gc2NvcGUuJGV2YWwoYXR0ci5zdFNvcnREZWZhdWx0KSA6IGF0dHIuc3RTb3J0RGVmYXVsdDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLmNvbHVtbnMucHVzaChwcmVkaWNhdGUpO1xyXG5cclxuICAgICAgICAvL3ZpZXcgLS0+IHRhYmxlIHN0YXRlXHJcbiAgICAgICAgZnVuY3Rpb24gc29ydCAoKSB7XHJcbiAgICAgICAgICBpbmRleCsrO1xyXG4gICAgICAgICAgcHJlZGljYXRlID0gbmcuaXNGdW5jdGlvbihnZXR0ZXIoc2NvcGUpKSA/IGdldHRlcihzY29wZSkgOiBhdHRyLnN0U29ydDtcclxuICAgICAgICAgIGlmIChpbmRleCAlIDMgPT09IDAgJiYgISFza2lwTmF0dXJhbCAhPT0gdHJ1ZSkge1xyXG4gICAgICAgICAgICAvL21hbnVhbCByZXNldFxyXG4gICAgICAgICAgICBpbmRleCA9IDA7XHJcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQgPSB7fTtcclxuICAgICAgICAgICAgY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5zdGFydCA9IDA7XHJcbiAgICAgICAgICAgIGN0cmwucGlwZSgpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY3RybC5zb3J0QnkocHJlZGljYXRlLCBpbmRleCAlIDIgPT09IDApO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZWxlbWVudC5iaW5kKCdjbGljaycsIGZ1bmN0aW9uIHNvcnRDbGljayAoKSB7XHJcbiAgICAgICAgICBpZiAocHJlZGljYXRlKSB7XHJcbiAgICAgICAgICAgIHNjb3BlLiRhcHBseShzb3J0KTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgaWYgKHNvcnREZWZhdWx0KSB7XHJcbiAgICAgICAgICBpbmRleCA9IHNvcnREZWZhdWx0ID09PSAncmV2ZXJzZScgPyAxIDogMDtcclxuICAgICAgICAgIHNvcnQoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vdGFibGUgc3RhdGUgLS0+IHZpZXdcclxuICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNvcnQ7XHJcbiAgICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XHJcbiAgICAgICAgICBpZiAobmV3VmFsdWUucHJlZGljYXRlICE9PSBwcmVkaWNhdGUpIHtcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICBlbGVtZW50XHJcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKGNsYXNzQXNjZW50KVxyXG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0Rlc2NlbnQpO1xyXG4gICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgaW5kZXggPSBuZXdWYWx1ZS5yZXZlcnNlID09PSB0cnVlID8gMiA6IDE7XHJcbiAgICAgICAgICAgIGVsZW1lbnRcclxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3Moc3RhdGVDbGFzc2VzW2luZGV4ICUgMl0pXHJcbiAgICAgICAgICAgICAgLmFkZENsYXNzKHN0YXRlQ2xhc3Nlc1tpbmRleCAtIDFdKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCB0cnVlKTtcclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0UGFnaW5hdGlvbicsIFsnc3RDb25maWcnLCBmdW5jdGlvbiAoc3RDb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHJlc3RyaWN0OiAnRUEnLFxyXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICBzY29wZToge1xyXG4gICAgICAgIHN0SXRlbXNCeVBhZ2U6ICc9PycsXHJcbiAgICAgICAgc3REaXNwbGF5ZWRQYWdlczogJz0/JyxcclxuICAgICAgICBzdFBhZ2VDaGFuZ2U6ICcmJ1xyXG4gICAgICB9LFxyXG4gICAgICB0ZW1wbGF0ZVVybDogZnVuY3Rpb24gKGVsZW1lbnQsIGF0dHJzKSB7XHJcbiAgICAgICAgaWYgKGF0dHJzLnN0VGVtcGxhdGUpIHtcclxuICAgICAgICAgIHJldHVybiBhdHRycy5zdFRlbXBsYXRlO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gc3RDb25maWcucGFnaW5hdGlvbi50ZW1wbGF0ZTtcclxuICAgICAgfSxcclxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRycywgY3RybCkge1xyXG5cclxuICAgICAgICBzY29wZS5zdEl0ZW1zQnlQYWdlID0gc2NvcGUuc3RJdGVtc0J5UGFnZSA/ICsoc2NvcGUuc3RJdGVtc0J5UGFnZSkgOiBzdENvbmZpZy5wYWdpbmF0aW9uLml0ZW1zQnlQYWdlO1xyXG4gICAgICAgIHNjb3BlLnN0RGlzcGxheWVkUGFnZXMgPSBzY29wZS5zdERpc3BsYXllZFBhZ2VzID8gKyhzY29wZS5zdERpc3BsYXllZFBhZ2VzKSA6IHN0Q29uZmlnLnBhZ2luYXRpb24uZGlzcGxheWVkUGFnZXM7XHJcblxyXG4gICAgICAgIHNjb3BlLmN1cnJlbnRQYWdlID0gMTtcclxuICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xyXG4gICAgICAgIHNjb3BlLmVsZW1lbnRzID0gY3RybC5nZXRFbGVtZW50cygpO1xyXG5cclxuICAgICAgICBmdW5jdGlvbiByZWRyYXcgKCkge1xyXG4gICAgICAgICAgdmFyIHBhZ2luYXRpb25TdGF0ZSA9IGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb247XHJcbiAgICAgICAgICB2YXIgc3RhcnQgPSAxO1xyXG4gICAgICAgICAgdmFyIGVuZDtcclxuICAgICAgICAgIHZhciBpO1xyXG4gICAgICAgICAgdmFyIHByZXZQYWdlID0gc2NvcGUuY3VycmVudFBhZ2U7XHJcbiAgICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IE1hdGguZmxvb3IocGFnaW5hdGlvblN0YXRlLnN0YXJ0IC8gcGFnaW5hdGlvblN0YXRlLm51bWJlcikgKyAxO1xyXG5cclxuICAgICAgICAgIHN0YXJ0ID0gTWF0aC5tYXgoc3RhcnQsIHNjb3BlLmN1cnJlbnRQYWdlIC0gTWF0aC5hYnMoTWF0aC5mbG9vcihzY29wZS5zdERpc3BsYXllZFBhZ2VzIC8gMikpKTtcclxuICAgICAgICAgIGVuZCA9IHN0YXJ0ICsgc2NvcGUuc3REaXNwbGF5ZWRQYWdlcztcclxuXHJcbiAgICAgICAgICBpZiAoZW5kID4gcGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXMpIHtcclxuICAgICAgICAgICAgZW5kID0gcGFnaW5hdGlvblN0YXRlLm51bWJlck9mUGFnZXMgKyAxO1xyXG4gICAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KDEsIGVuZCAtIHNjb3BlLnN0RGlzcGxheWVkUGFnZXMpO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHNjb3BlLnBhZ2VzID0gW107XHJcbiAgICAgICAgICBzY29wZS5udW1QYWdlcyA9IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzO1xyXG5cclxuICAgICAgICAgIGlmIChwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcyl7XHJcbiAgICAgICAgICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcclxuICAgICAgICAgICAgICBzY29wZS5wYWdlcy5wdXNoKGkpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHByZXZQYWdlICE9PSBzY29wZS5jdXJyZW50UGFnZSkge1xyXG4gICAgICAgICAgICBzY29wZS5zdFBhZ2VDaGFuZ2Uoe25ld1BhZ2U6IHNjb3BlLmN1cnJlbnRQYWdlfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xyXG4gICAgICAgIH0sIHJlZHJhdywgdHJ1ZSk7XHJcblxyXG4gICAgICAgIC8vc2NvcGUgLS0+IHRhYmxlIHN0YXRlICAoLS0+IHZpZXcpXHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdEl0ZW1zQnlQYWdlJywgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xyXG4gICAgICAgICAgICBzY29wZS5zZWxlY3RQYWdlKDEpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzY29wZS4kd2F0Y2goJ3N0RGlzcGxheWVkUGFnZXMnLCByZWRyYXcpO1xyXG5cclxuICAgICAgICAvL3ZpZXcgLT4gdGFibGUgc3RhdGVcclxuICAgICAgICBzY29wZS5zZWxlY3RQYWdlID0gZnVuY3Rpb24gKHBhZ2UpIHtcclxuICAgICAgICAgIGlmIChwYWdlID4gMCAmJiBwYWdlIDw9IHNjb3BlLm51bVBhZ2VzKSB7XHJcbiAgICAgICAgICAgIGN0cmwuc2xpY2UoKHBhZ2UgLSAxKSAqIHNjb3BlLnN0SXRlbXNCeVBhZ2UsIHNjb3BlLnN0SXRlbXNCeVBhZ2UpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmICghY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5udW1iZXIpIHtcclxuICAgICAgICAgIGN0cmwuc2xpY2UoMCwgc2NvcGUuc3RJdGVtc0J5UGFnZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1dKTtcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmRpcmVjdGl2ZSgnc3RQaXBlJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChjb25maWcsICR0aW1lb3V0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXF1aXJlOiAnc3RUYWJsZScsXHJcbiAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgc3RQaXBlOiAnPSdcclxuICAgICAgfSxcclxuICAgICAgbGluazoge1xyXG5cclxuICAgICAgICBwcmU6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgICB2YXIgcGlwZVByb21pc2UgPSBudWxsO1xyXG5cclxuICAgICAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHNjb3BlLnN0UGlwZSkpIHtcclxuICAgICAgICAgICAgY3RybC5wcmV2ZW50UGlwZU9uV2F0Y2goKTtcclxuICAgICAgICAgICAgY3RybC5waXBlID0gZnVuY3Rpb24gKCkge1xyXG5cclxuICAgICAgICAgICAgICBpZiAocGlwZVByb21pc2UgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwaXBlUHJvbWlzZSlcclxuICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgIHBpcGVQcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgc2NvcGUuc3RQaXBlKGN0cmwudGFibGVTdGF0ZSgpLCBjdHJsKTtcclxuICAgICAgICAgICAgICB9LCBjb25maWcucGlwZS5kZWxheSk7XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiBwaXBlUHJvbWlzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIHBvc3Q6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuICAgICAgICAgIGN0cmwucGlwZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0UmVzZXRGaWx0ZXInLCBbJyRwYXJzZScsIGZ1bmN0aW9uICgkcGFyc2UpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICAgICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZUN0cmwgPSBjdHJsO1xyXG4gICAgICAgICAgICAgICAgdmFyIGZuID0gJHBhcnNlKGF0dHJbJ3N0UmVzZXRGaWx0ZXInXSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5vbignY2xpY2snLCBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zZWFyY2ggPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICB0YWJsZUN0cmwuc2VhcmNoKCcnLCAnJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm4oc2NvcGUsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRldmVudDogZXZlbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICB9XSk7IiwifSkoYW5ndWxhcik7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9