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

          for (i = start; i < end; i++) {
            scope.pages.push(i);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInNyYy90b3AudHh0Iiwic3JjL3NtYXJ0LXRhYmxlLm1vZHVsZS5qcyIsInNyYy9zdENvbmZpZy5qcyIsInNyYy9zdFRhYmxlLmpzIiwic3JjL3N0U2VhcmNoLmpzIiwic3JjL3N0U2VsZWN0Um93LmpzIiwic3JjL3N0U29ydC5qcyIsInNyYy9zdFBhZ2luYXRpb24uanMiLCJzcmMvc3RQaXBlLmpzIiwic3JjL3N0UmVzZXRGaWx0ZXIuanMiLCJzcmMvYm90dG9tLnR4dCJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxUUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUMxQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUNuRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDaEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FDcENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQ3BCQSIsImZpbGUiOiJzbWFydC10YWJsZS5qcyIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiAobmcsIHVuZGVmaW5lZCl7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnLCBbXSkucnVuKFsnJHRlbXBsYXRlQ2FjaGUnLCBmdW5jdGlvbiAoJHRlbXBsYXRlQ2FjaGUpIHtcclxuICAgICR0ZW1wbGF0ZUNhY2hlLnB1dCgndGVtcGxhdGUvc21hcnQtdGFibGUvcGFnaW5hdGlvbi5odG1sJyxcclxuICAgICAgICAnPG5hdiBuZy1pZj1cInBhZ2VzLmxlbmd0aCA+PSAyXCI+PHVsIGNsYXNzPVwicGFnaW5hdGlvblwiPicgK1xyXG4gICAgICAgICc8bGkgbmctcmVwZWF0PVwicGFnZSBpbiBwYWdlc1wiIG5nLWNsYXNzPVwie2FjdGl2ZTogcGFnZT09Y3VycmVudFBhZ2V9XCI+PGEgbmctY2xpY2s9XCJzZWxlY3RQYWdlKHBhZ2UpXCI+e3twYWdlfX08L2E+PC9saT4nICtcclxuICAgICAgICAnPC91bD48L25hdj4nKTtcclxufV0pO1xyXG5cclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmNvbnN0YW50KCdzdENvbmZpZycsIHtcclxuICAgIHBhZ2luYXRpb246IHtcclxuICAgICAgdGVtcGxhdGU6ICd0ZW1wbGF0ZS9zbWFydC10YWJsZS9wYWdpbmF0aW9uLmh0bWwnLFxyXG4gICAgICBpdGVtc0J5UGFnZTogMTAsXHJcbiAgICAgIGRpc3BsYXllZFBhZ2VzOiA1XHJcbiAgICB9LFxyXG4gICAgc2VhcmNoOiB7XHJcbiAgICAgIGRlbGF5OiA0MDAgLy8gbXNcclxuICAgIH0sXHJcbiAgICBzZWxlY3Q6IHtcclxuICAgICAgbW9kZTogJ3NpbmdsZScsXHJcbiAgICAgIHNlbGVjdGVkQ2xhc3M6ICdzdC1zZWxlY3RlZCdcclxuICAgIH0sXHJcbiAgICBzb3J0OiB7XHJcbiAgICAgIGFzY2VudENsYXNzOiAnc3Qtc29ydC1hc2NlbnQnLFxyXG4gICAgICBkZXNjZW50Q2xhc3M6ICdzdC1zb3J0LWRlc2NlbnQnLFxyXG4gICAgICBza2lwTmF0dXJhbDogZmFsc2VcclxuICAgIH0sXHJcbiAgICBwaXBlOiB7XHJcbiAgICAgIGRlbGF5OiAxMDAgLy9tc1xyXG4gICAgfSxcclxuICAgIHNlYXJjaFR5cGU6IHtcclxuICAgICAgc2VydmVyOiB0cnVlXHJcbiAgICB9XHJcbiAgfSk7IiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmNvbnRyb2xsZXIoJ3N0VGFibGVDb250cm9sbGVyJywgWyckc2NvcGUnLCAnJHBhcnNlJywgJyRmaWx0ZXInLCAnJGF0dHJzJywgJ3N0Q29uZmlnJywgZnVuY3Rpb24gU3RUYWJsZUNvbnRyb2xsZXIgKCRzY29wZSwgJHBhcnNlLCAkZmlsdGVyLCAkYXR0cnMsIHN0Q29uZmlnKSB7XHJcbiAgICB2YXIgcHJvcGVydHlOYW1lID0gJGF0dHJzLnN0VGFibGU7XHJcbiAgICB2YXIgbG9jYWxTZWFyY2ggPSAkYXR0cnMubG9jYWxTZWFyY2ggPT0ndHJ1ZScgfHwgZmFsc2U7XHJcbiAgICB2YXIgZGlzcGxheUdldHRlciA9ICRwYXJzZShwcm9wZXJ0eU5hbWUpO1xyXG4gICAgdmFyIGRpc3BsYXlTZXR0ZXIgPSBkaXNwbGF5R2V0dGVyLmFzc2lnbjtcclxuICAgIHZhciBzYWZlR2V0dGVyO1xyXG4gICAgdmFyIG9yZGVyQnkgPSAkZmlsdGVyKCdvcmRlckJ5Jyk7XHJcbiAgICB2YXIgZmlsdGVyID0gJGZpbHRlcignZmlsdGVyJyk7XHJcbiAgICB2YXIgc2FmZUNvcHkgPSBjb3B5UmVmcyhkaXNwbGF5R2V0dGVyKCRzY29wZSkpO1xyXG4gICAgdmFyIHRhYmxlU3RhdGUgPSB7XHJcbiAgICAgIHNvcnQ6IHt9LFxyXG4gICAgICBzZWFyY2g6IHt9LFxyXG4gICAgICBwYWdpbmF0aW9uOiB7XHJcbiAgICAgICAgc3RhcnQ6IDBcclxuICAgICAgfSxcclxuICAgICAgY29sdW1uczogW11cclxuICAgIH07XHJcbiAgICB2YXIgZmlsdGVyZWQ7XHJcbiAgICB2YXIgcGlwZUFmdGVyU2FmZUNvcHkgPSB0cnVlO1xyXG4gICAgdmFyIGN0cmwgPSB0aGlzO1xyXG4gICAgdmFyIGxhc3RTZWxlY3RlZDtcclxuICAgIHZhciBlbGVtZW50cyA9IHt9O1xyXG5cclxuICAgIGZ1bmN0aW9uIGNvcHlSZWZzIChzcmMpIHtcclxuICAgICAgcmV0dXJuIHNyYyA/IFtdLmNvbmNhdChzcmMpIDogW107XHJcbiAgICB9XHJcblxyXG4gICAgZnVuY3Rpb24gdXBkYXRlU2FmZUNvcHkgKCkge1xyXG4gICAgICBzYWZlQ29weSA9IGNvcHlSZWZzKHNhZmVHZXR0ZXIoJHNjb3BlKSk7XHJcbiAgICAgIGlmIChwaXBlQWZ0ZXJTYWZlQ29weSA9PT0gdHJ1ZSkge1xyXG4gICAgICAgIGN0cmwucGlwZSgpO1xyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKCRhdHRycy5zdFNhZmVTcmMpIHtcclxuICAgICAgc2FmZUdldHRlciA9ICRwYXJzZSgkYXR0cnMuc3RTYWZlU3JjKTtcclxuICAgICAgJHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgdmFyIHNhZmVTcmMgPSBzYWZlR2V0dGVyKCRzY29wZSk7XHJcbiAgICAgICAgcmV0dXJuIHNhZmVTcmMgPyBzYWZlU3JjLmxlbmd0aCA6IDA7XHJcblxyXG4gICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBzYWZlQ29weS5sZW5ndGgpIHtcclxuICAgICAgICAgIHVwZGF0ZVNhZmVDb3B5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgICAgJHNjb3BlLiR3YXRjaChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgcmV0dXJuIHNhZmVHZXR0ZXIoJHNjb3BlKTtcclxuICAgICAgfSwgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xyXG4gICAgICAgIGlmIChuZXdWYWx1ZSAhPT0gb2xkVmFsdWUpIHtcclxuICAgICAgICAgIHVwZGF0ZVNhZmVDb3B5KCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIHNvcnQgdGhlIHJvd3NcclxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHByZWRpY2F0ZSAtIGZ1bmN0aW9uIG9yIHN0cmluZyB3aGljaCB3aWxsIGJlIHVzZWQgYXMgcHJlZGljYXRlIGZvciB0aGUgc29ydGluZ1xyXG4gICAgICogQHBhcmFtIFtyZXZlcnNlXSAtIGlmIHlvdSB3YW50IHRvIHJldmVyc2UgdGhlIG9yZGVyXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc29ydEJ5ID0gZnVuY3Rpb24gc29ydEJ5IChwcmVkaWNhdGUsIHJldmVyc2UpIHtcclxuICAgICAgdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSA9IHByZWRpY2F0ZTtcclxuICAgICAgdGFibGVTdGF0ZS5zb3J0LnJldmVyc2UgPSByZXZlcnNlID09PSB0cnVlO1xyXG5cclxuICAgICAgaWYgKG5nLmlzRnVuY3Rpb24ocHJlZGljYXRlKSkge1xyXG4gICAgICAgIHRhYmxlU3RhdGUuc29ydC5mdW5jdGlvbk5hbWUgPSBwcmVkaWNhdGUubmFtZTtcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICBkZWxldGUgdGFibGVTdGF0ZS5zb3J0LmZ1bmN0aW9uTmFtZTtcclxuICAgICAgfVxyXG5cclxuICAgICAgdGFibGVTdGF0ZS5wYWdpbmF0aW9uLnN0YXJ0ID0gMDtcclxuICAgICAgcmV0dXJuIHRoaXMucGlwZSgpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIHNlYXJjaCBtYXRjaGluZyByb3dzXHJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgLSB0aGUgaW5wdXQgc3RyaW5nXHJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gW3ByZWRpY2F0ZV0gLSB0aGUgcHJvcGVydHkgbmFtZSBhZ2FpbnN0IHlvdSB3YW50IHRvIGNoZWNrIHRoZSBtYXRjaCwgb3RoZXJ3aXNlIGl0IHdpbGwgc2VhcmNoIG9uIGFsbCBwcm9wZXJ0aWVzXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc2VhcmNoID0gZnVuY3Rpb24gc2VhcmNoIChpbnB1dCwgcHJlZGljYXRlKSB7XHJcbiAgICAgIHZhciBwcmVkaWNhdGVPYmplY3QgPSB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgfHwge307XHJcbiAgICAgIHZhciBwcm9wID0gcHJlZGljYXRlID8gcHJlZGljYXRlIDogJyQnO1xyXG5cclxuICAgICAgaW5wdXQgPSBuZy5pc1N0cmluZyhpbnB1dCkgPyBpbnB1dC50cmltKCkgOiBpbnB1dDtcclxuICAgICAgcHJlZGljYXRlT2JqZWN0W3Byb3BdID0gaW5wdXQ7XHJcbiAgICAgIC8vIHRvIGF2b2lkIHRvIGZpbHRlciBvdXQgbnVsbCB2YWx1ZVxyXG4gICAgICBpZiAoIWlucHV0KSB7XHJcbiAgICAgICAgZGVsZXRlIHByZWRpY2F0ZU9iamVjdFtwcm9wXTtcclxuICAgICAgfVxyXG4gICAgICB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QgPSBwcmVkaWNhdGVPYmplY3Q7XHJcbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IDA7XHJcbiAgICAgIHJldHVybiB0aGlzLnBpcGUoKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiB0aGlzIHdpbGwgY2hhaW4gdGhlIG9wZXJhdGlvbnMgb2Ygc29ydGluZyBhbmQgZmlsdGVyaW5nIGJhc2VkIG9uIHRoZSBjdXJyZW50IHRhYmxlIHN0YXRlIChzb3J0IG9wdGlvbnMsIGZpbHRlcmluZywgZWN0KVxyXG4gICAgICovXHJcbiAgICB0aGlzLnBpcGUgPSBmdW5jdGlvbiBwaXBlICgpIHtcclxuICAgICAgaWYobG9jYWxTZWFyY2gpIHtcclxuICAgICAgICB0aGlzLmxvY2FsU2VhcmNoKCk7XHJcbiAgICAgIH1cclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5zZXJ2ZXJTZWFyY2goKTtcclxuICAgICAgfVxyXG4gICAgICB0aGlzLnJlY2FsY3VsYXRlRWxlbWVudHMoKTtcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5zZXJ2ZXJTZWFyY2ggPSBmdW5jdGlvbiBzZXJ2ZXJTZWFyY2goKSB7XHJcbiAgICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XHJcbiAgICAgIHZhciBwYXJhbXMgPSB7XHJcbiAgICAgICAgb3JkZXJCeTogdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSxcclxuICAgICAgICByZXZlcnNlOiB0YWJsZVN0YXRlLnNvcnQucmV2ZXJzZSxcclxuICAgICAgICBmaWx0ZXI6IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdD8gdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0LiQgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgb2Zmc2V0OiBwYWdpbmF0aW9uLnN0YXJ0LFxyXG4gICAgICAgIHBhZ2VTaXplOiBwYWdpbmF0aW9uLm51bWJlcixcclxuICAgICAgICBjb2x1bW5zOiB0YWJsZVN0YXRlLmNvbHVtbnNcclxuICAgICAgfTtcclxuXHJcbiAgICAgICRzY29wZVskYXR0cnMuc3RTZWFyY2hGbl0ocGFyYW1zKS50aGVuKGZ1bmN0aW9uIChyZXMpIHtcclxuICAgICAgICBmaWx0ZXJlZCA9IHJlc1swXS5jb2xsZWN0aW9uO1xyXG4gICAgICAgIHZhciBvdXRwdXQgPSBzZWxmLnBhZ2luYXRlKHBhZ2luYXRpb24sIHJlc1swXS5sZW5ndGgpO1xyXG4gICAgICAgIGlmKHBhcmFtcy5vZmZzZXQgPT0gcGFnaW5hdGlvbi5zdGFydCl7XHJcbiAgICAgICAgICBkaXNwbGF5U2V0dGVyKCRzY29wZSwgb3V0cHV0IHx8IGZpbHRlcmVkKTtcclxuICAgICAgICB9IGVsc2V7XHJcbiAgICAgICAgICBwYXJhbXMub2Zmc2V0ID0gcGFnaW5hdGlvbi5zdGFydDtcclxuICAgICAgICAgICRzY29wZVskYXR0cnMuc3RTZWFyY2hGbl0ocGFyYW1zKS50aGVuKGZ1bmN0aW9uIChyZXMpe1xyXG4gICAgICAgICAgICBmaWx0ZXJlZCA9IHJlc1swXS5jb2xsZWN0aW9uO1xyXG4gICAgICAgICAgICBkaXNwbGF5U2V0dGVyKCRzY29wZSwgZmlsdGVyZWQpO1xyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH0pO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmxvY2FsU2VhcmNoID0gZnVuY3Rpb24gbG9jYWxTZWFyY2goKSB7XHJcbiAgICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgICAgdmFyIHBhZ2luYXRpb24gPSB0YWJsZVN0YXRlLnBhZ2luYXRpb247XHJcbiAgICAgIGZpbHRlcmVkID0gdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0ID8gZmlsdGVyKHNhZmVDb3B5LCB0YWJsZVN0YXRlLnNlYXJjaC5wcmVkaWNhdGVPYmplY3QpIDogc2FmZUNvcHk7XHJcbiAgICAgICAgaWYgKHRhYmxlU3RhdGUuc29ydC5wcmVkaWNhdGUpIHtcclxuICAgICAgICAgIGZpbHRlcmVkID0gb3JkZXJCeShmaWx0ZXJlZCwgdGFibGVTdGF0ZS5zb3J0LnByZWRpY2F0ZSwgdGFibGVTdGF0ZS5zb3J0LnJldmVyc2UpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB2YXIgb3V0cHV0ID0gc2VsZi5wYWdpbmF0ZShwYWdpbmF0aW9uLCBmaWx0ZXJlZC5sZW5ndGgpO1xyXG4gICAgICAgIGRpc3BsYXlTZXR0ZXIoJHNjb3BlLCBvdXRwdXQgfHwgZmlsdGVyZWQpO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnBhZ2luYXRlID0gZnVuY3Rpb24gcGFnaW5hdGUgKHBhZ2luYXRpb24sIGNvbGxlY3Rpb25MZW5ndGgpIHtcclxuICAgICAgaWYgKHBhZ2luYXRpb24ubnVtYmVyICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICBwYWdpbmF0aW9uLm51bWJlck9mUGFnZXMgPSBjb2xsZWN0aW9uTGVuZ3RoID4gMCA/IE1hdGguY2VpbChjb2xsZWN0aW9uTGVuZ3RoIC8gcGFnaW5hdGlvbi5udW1iZXIpIDogMTtcclxuICAgICAgICBwYWdpbmF0aW9uLnN0YXJ0ID0gcGFnaW5hdGlvbi5zdGFydCA+PSBjb2xsZWN0aW9uTGVuZ3RoID8gKHBhZ2luYXRpb24ubnVtYmVyT2ZQYWdlcyAtIDEpICogcGFnaW5hdGlvbi5udW1iZXIgOiBwYWdpbmF0aW9uLnN0YXJ0O1xyXG4gICAgICAgIGlmKGxvY2FsU2VhcmNoKXtcclxuICAgICAgICAgIHJldHVybiBmaWx0ZXJlZC5zbGljZShwYWdpbmF0aW9uLnN0YXJ0LCBwYWdpbmF0aW9uLnN0YXJ0ICsgcGFnaW5hdGlvbi5udW1iZXIpO1xyXG4gICAgICAgIH0gZWxzZXtcclxuICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBlbHNlIHtcclxuICAgICAgICByZXR1cm4gW107XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBzZWxlY3QgYSBkYXRhUm93IChpdCB3aWxsIGFkZCB0aGUgYXR0cmlidXRlIGlzU2VsZWN0ZWQgdG8gdGhlIHJvdyBvYmplY3QpXHJcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcm93IC0gdGhlIHJvdyB0byBzZWxlY3RcclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBbbW9kZV0gLSBcInNpbmdsZVwiIG9yIFwibXVsdGlwbGVcIiAobXVsdGlwbGUgYnkgZGVmYXVsdClcclxuICAgICAqL1xyXG4gICAgdGhpcy5zZWxlY3QgPSBmdW5jdGlvbiBzZWxlY3QgKHJvdywgbW9kZSkge1xyXG4gICAgICB2YXIgcm93cyA9IGNvcHlSZWZzKGRpc3BsYXlHZXR0ZXIoJHNjb3BlKSk7XHJcbiAgICAgIHZhciBpbmRleCA9IHJvd3MuaW5kZXhPZihyb3cpO1xyXG4gICAgICBpZiAoaW5kZXggIT09IC0xKSB7XHJcbiAgICAgICAgaWYgKG1vZGUgPT09ICdzaW5nbGUnKSB7XHJcbiAgICAgICAgICByb3cuaXNTZWxlY3RlZCA9IHJvdy5pc1NlbGVjdGVkICE9PSB0cnVlO1xyXG4gICAgICAgICAgaWYgKGxhc3RTZWxlY3RlZCkge1xyXG4gICAgICAgICAgICBsYXN0U2VsZWN0ZWQuaXNTZWxlY3RlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgbGFzdFNlbGVjdGVkID0gcm93LmlzU2VsZWN0ZWQgPT09IHRydWUgPyByb3cgOiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHJvd3NbaW5kZXhdLmlzU2VsZWN0ZWQgPSAhcm93c1tpbmRleF0uaXNTZWxlY3RlZDtcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiB0YWtlIGEgc2xpY2Ugb2YgdGhlIGN1cnJlbnQgc29ydGVkL2ZpbHRlcmVkIGNvbGxlY3Rpb24gKHBhZ2luYXRpb24pXHJcbiAgICAgKlxyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0IC0gc3RhcnQgaW5kZXggb2YgdGhlIHNsaWNlXHJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbnVtYmVyIC0gdGhlIG51bWJlciBvZiBpdGVtIGluIHRoZSBzbGljZVxyXG4gICAgICovXHJcbiAgICB0aGlzLnNsaWNlID0gZnVuY3Rpb24gc3BsaWNlIChzdGFydCwgbnVtYmVyKSB7XHJcbiAgICAgIHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCA9IHN0YXJ0O1xyXG4gICAgICB0YWJsZVN0YXRlLnBhZ2luYXRpb24ubnVtYmVyID0gbnVtYmVyO1xyXG4gICAgICByZXR1cm4gdGhpcy5waXBlKCk7XHJcbiAgICB9O1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogcmV0dXJuIHRoZSBjdXJyZW50IHN0YXRlIG9mIHRoZSB0YWJsZVxyXG4gICAgICogQHJldHVybnMge3tzb3J0OiB7fSwgc2VhcmNoOiB7fSwgcGFnaW5hdGlvbjoge3N0YXJ0OiBudW1iZXJ9fX1cclxuICAgICAqL1xyXG4gICAgdGhpcy50YWJsZVN0YXRlID0gZnVuY3Rpb24gZ2V0VGFibGVTdGF0ZSAoKSB7XHJcbiAgICAgIHJldHVybiB0YWJsZVN0YXRlO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldEZpbHRlcmVkQ29sbGVjdGlvbiA9IGZ1bmN0aW9uIGdldEZpbHRlcmVkQ29sbGVjdGlvbiAoKSB7XHJcbiAgICAgIHJldHVybiBmaWx0ZXJlZCB8fCBzYWZlQ29weTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVc2UgYSBkaWZmZXJlbnQgZmlsdGVyIGZ1bmN0aW9uIHRoYW4gdGhlIGFuZ3VsYXIgRmlsdGVyRmlsdGVyXHJcbiAgICAgKiBAcGFyYW0gZmlsdGVyTmFtZSB0aGUgbmFtZSB1bmRlciB3aGljaCB0aGUgY3VzdG9tIGZpbHRlciBpcyByZWdpc3RlcmVkXHJcbiAgICAgKi9cclxuICAgIHRoaXMuc2V0RmlsdGVyRnVuY3Rpb24gPSBmdW5jdGlvbiBzZXRGaWx0ZXJGdW5jdGlvbiAoZmlsdGVyTmFtZSkge1xyXG4gICAgICBmaWx0ZXIgPSAkZmlsdGVyKGZpbHRlck5hbWUpO1xyXG4gICAgfTtcclxuXHJcbiAgICAvKipcclxuICAgICAqIFVzZSBhIGRpZmZlcmVudCBmdW5jdGlvbiB0aGFuIHRoZSBhbmd1bGFyIG9yZGVyQnlcclxuICAgICAqIEBwYXJhbSBzb3J0RnVuY3Rpb25OYW1lIHRoZSBuYW1lIHVuZGVyIHdoaWNoIHRoZSBjdXN0b20gb3JkZXIgZnVuY3Rpb24gaXMgcmVnaXN0ZXJlZFxyXG4gICAgICovXHJcbiAgICB0aGlzLnNldFNvcnRGdW5jdGlvbiA9IGZ1bmN0aW9uIHNldFNvcnRGdW5jdGlvbiAoc29ydEZ1bmN0aW9uTmFtZSkge1xyXG4gICAgICBvcmRlckJ5ID0gJGZpbHRlcihzb3J0RnVuY3Rpb25OYW1lKTtcclxuICAgIH07XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVc3VhbGx5IHdoZW4gdGhlIHNhZmUgY29weSBpcyB1cGRhdGVkIHRoZSBwaXBlIGZ1bmN0aW9uIGlzIGNhbGxlZC5cclxuICAgICAqIENhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCBwcmV2ZW50IGl0LCB3aGljaCBpcyBzb21ldGhpbmcgcmVxdWlyZWQgd2hlbiB1c2luZyBhIGN1c3RvbSBwaXBlIGZ1bmN0aW9uXHJcbiAgICAgKi9cclxuICAgIHRoaXMucHJldmVudFBpcGVPbldhdGNoID0gZnVuY3Rpb24gcHJldmVudFBpcGUgKCkge1xyXG4gICAgICBwaXBlQWZ0ZXJTYWZlQ29weSA9IGZhbHNlO1xyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLmdldEVsZW1lbnRzID0gZnVuY3Rpb24gZ2V0RWxlbWVudHMoKSB7XHJcbiAgICAgIHJldHVybiBlbGVtZW50cztcclxuICAgIH07XHJcblxyXG4gICAgdGhpcy5yZWNhbGN1bGF0ZUVsZW1lbnRzID0gZnVuY3Rpb24gcmVjYWxjdWxhdGVFbGVtZW50cygpIHtcclxuICAgICAgaWYobG9jYWxTZWFyY2gpe1xyXG4gICAgICAgIGVsZW1lbnRzLmNvdW50ID0gc2FmZUNvcHkubGVuZ3RoO1xyXG4gICAgICB9IGVsc2V7XHJcbiAgICAgICAgJHNjb3BlWyRhdHRycy5zdFNlYXJjaEZuXSh7XHJcbiAgICAgICAgICBvcmRlckJ5OiB0YWJsZVN0YXRlLnNvcnQucHJlZGljYXRlLFxyXG4gICAgICAgICAgcmV2ZXJzZTogdGFibGVTdGF0ZS5zb3J0LnJldmVyc2UsXHJcbiAgICAgICAgICBmaWx0ZXI6IHRhYmxlU3RhdGUuc2VhcmNoLnByZWRpY2F0ZU9iamVjdD8gdGFibGVTdGF0ZS5zZWFyY2gucHJlZGljYXRlT2JqZWN0LiQgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICBvZmZzZXQ6IHRhYmxlU3RhdGUucGFnaW5hdGlvbi5zdGFydCxcclxuICAgICAgICAgIGNvbHVtbnM6IHRhYmxlU3RhdGUuY29sdW1uc1xyXG4gICAgICAgIH0pLnRoZW4oZnVuY3Rpb24gKHJlcykge1xyXG4gICAgICAgICAgZWxlbWVudHMuY291bnQgPSByZXNbMF0ubGVuZ3RoO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG5cclxuICB9XSlcclxuICAuZGlyZWN0aXZlKCdzdFRhYmxlJywgZnVuY3Rpb24gKCkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgY29udHJvbGxlcjogJ3N0VGFibGVDb250cm9sbGVyJyxcclxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XHJcblxyXG4gICAgICAgIGlmIChhdHRyLnN0U2V0RmlsdGVyKSB7XHJcbiAgICAgICAgICBjdHJsLnNldEZpbHRlckZ1bmN0aW9uKGF0dHIuc3RTZXRGaWx0ZXIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKGF0dHIuc3RTZXRTb3J0KSB7XHJcbiAgICAgICAgICBjdHJsLnNldFNvcnRGdW5jdGlvbihhdHRyLnN0U2V0U29ydCk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNlYXJjaCcsIFsnc3RDb25maWcnLCAnJHRpbWVvdXQnLCBmdW5jdGlvbiAoc3RDb25maWcsICR0aW1lb3V0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICB2YXIgdGFibGVDdHJsID0gY3RybDtcclxuICAgICAgICB2YXIgcHJvbWlzZSA9IG51bGw7XHJcbiAgICAgICAgdmFyIHRocm90dGxlID0gYXR0ci5zdERlbGF5IHx8IHN0Q29uZmlnLnNlYXJjaC5kZWxheTtcclxuXHJcbiAgICAgICAgYXR0ci4kb2JzZXJ2ZSgnc3RTZWFyY2gnLCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgICB2YXIgaW5wdXQgPSBlbGVtZW50WzBdLnZhbHVlO1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSAmJiBpbnB1dCkge1xyXG4gICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zZWFyY2ggPSB7fTtcclxuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChpbnB1dCwgbmV3VmFsdWUpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0+IHZpZXdcclxuICAgICAgICBzY29wZS4kd2F0Y2goZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgcmV0dXJuIGN0cmwudGFibGVTdGF0ZSgpLnNlYXJjaDtcclxuICAgICAgICB9LCBmdW5jdGlvbiAobmV3VmFsdWUsIG9sZFZhbHVlKSB7XHJcbiAgICAgICAgICB2YXIgcHJlZGljYXRlRXhwcmVzc2lvbiA9IGF0dHIuc3RTZWFyY2ggfHwgJyQnO1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdCAmJiBuZXdWYWx1ZS5wcmVkaWNhdGVPYmplY3RbcHJlZGljYXRlRXhwcmVzc2lvbl0gIT09IGVsZW1lbnRbMF0udmFsdWUpIHtcclxuICAgICAgICAgICAgZWxlbWVudFswXS52YWx1ZSA9IG5ld1ZhbHVlLnByZWRpY2F0ZU9iamVjdFtwcmVkaWNhdGVFeHByZXNzaW9uXSB8fCAnJztcclxuICAgICAgICAgIH1cclxuICAgICAgICB9LCB0cnVlKTtcclxuXHJcbiAgICAgICAgLy8gdmlldyAtPiB0YWJsZSBzdGF0ZVxyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnaW5wdXQnLCBmdW5jdGlvbiAoZXZ0KSB7XHJcbiAgICAgICAgICBldnQgPSBldnQub3JpZ2luYWxFdmVudCB8fCBldnQ7XHJcbiAgICAgICAgICBpZiAocHJvbWlzZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICAkdGltZW91dC5jYW5jZWwocHJvbWlzZSk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgcHJvbWlzZSA9ICR0aW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgdGFibGVDdHJsLnNlYXJjaChldnQudGFyZ2V0LnZhbHVlLCBhdHRyLnN0U2VhcmNoIHx8ICcnKTtcclxuICAgICAgICAgICAgcHJvbWlzZSA9IG51bGw7XHJcbiAgICAgICAgICB9LCB0aHJvdHRsZSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFNlbGVjdFJvdycsIFsnc3RDb25maWcnLCBmdW5jdGlvbiAoc3RDb25maWcpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHJlc3RyaWN0OiAnQScsXHJcbiAgICAgIHJlcXVpcmU6ICdec3RUYWJsZScsXHJcbiAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgcm93OiAnPXN0U2VsZWN0Um93J1xyXG4gICAgICB9LFxyXG4gICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICB2YXIgbW9kZSA9IGF0dHIuc3RTZWxlY3RNb2RlIHx8IHN0Q29uZmlnLnNlbGVjdC5tb2RlO1xyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICBjdHJsLnNlbGVjdChzY29wZS5yb3csIG1vZGUpO1xyXG4gICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHNjb3BlLiR3YXRjaCgncm93LmlzU2VsZWN0ZWQnLCBmdW5jdGlvbiAobmV3VmFsdWUpIHtcclxuICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gdHJ1ZSkge1xyXG4gICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKHN0Q29uZmlnLnNlbGVjdC5zZWxlY3RlZENsYXNzKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2xhc3Moc3RDb25maWcuc2VsZWN0LnNlbGVjdGVkQ2xhc3MpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1dKTtcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmRpcmVjdGl2ZSgnc3RTb3J0JywgWydzdENvbmZpZycsICckcGFyc2UnLCBmdW5jdGlvbiAoc3RDb25maWcsICRwYXJzZSkge1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcmVzdHJpY3Q6ICdBJyxcclxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50LCBhdHRyLCBjdHJsKSB7XHJcblxyXG4gICAgICAgIHZhciBwcmVkaWNhdGUgPSBhdHRyLnN0U29ydDtcclxuICAgICAgICB2YXIgZ2V0dGVyID0gJHBhcnNlKHByZWRpY2F0ZSk7XHJcbiAgICAgICAgdmFyIGluZGV4ID0gMDtcclxuICAgICAgICB2YXIgY2xhc3NBc2NlbnQgPSBhdHRyLnN0Q2xhc3NBc2NlbnQgfHwgc3RDb25maWcuc29ydC5hc2NlbnRDbGFzcztcclxuICAgICAgICB2YXIgY2xhc3NEZXNjZW50ID0gYXR0ci5zdENsYXNzRGVzY2VudCB8fCBzdENvbmZpZy5zb3J0LmRlc2NlbnRDbGFzcztcclxuICAgICAgICB2YXIgc3RhdGVDbGFzc2VzID0gW2NsYXNzQXNjZW50LCBjbGFzc0Rlc2NlbnRdO1xyXG4gICAgICAgIHZhciBzb3J0RGVmYXVsdDtcclxuICAgICAgICB2YXIgc2tpcE5hdHVyYWwgPSBhdHRyLnN0U2tpcE5hdHVyYWwgIT09IHVuZGVmaW5lZCA/IGF0dHIuc3RTa2lwTmF0dXJhbCA6IHN0Q29uZmlnLnNraXBOYXR1cmFsO1xyXG5cclxuICAgICAgICBpZiAoYXR0ci5zdFNvcnREZWZhdWx0KSB7XHJcbiAgICAgICAgICBzb3J0RGVmYXVsdCA9IHNjb3BlLiRldmFsKGF0dHIuc3RTb3J0RGVmYXVsdCkgIT09IHVuZGVmaW5lZCA/IHNjb3BlLiRldmFsKGF0dHIuc3RTb3J0RGVmYXVsdCkgOiBhdHRyLnN0U29ydERlZmF1bHQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5jb2x1bW5zLnB1c2gocHJlZGljYXRlKTtcclxuXHJcbiAgICAgICAgLy92aWV3IC0tPiB0YWJsZSBzdGF0ZVxyXG4gICAgICAgIGZ1bmN0aW9uIHNvcnQgKCkge1xyXG4gICAgICAgICAgaW5kZXgrKztcclxuICAgICAgICAgIHByZWRpY2F0ZSA9IG5nLmlzRnVuY3Rpb24oZ2V0dGVyKHNjb3BlKSkgPyBnZXR0ZXIoc2NvcGUpIDogYXR0ci5zdFNvcnQ7XHJcbiAgICAgICAgICBpZiAoaW5kZXggJSAzID09PSAwICYmICEhc2tpcE5hdHVyYWwgIT09IHRydWUpIHtcclxuICAgICAgICAgICAgLy9tYW51YWwgcmVzZXRcclxuICAgICAgICAgICAgaW5kZXggPSAwO1xyXG4gICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zb3J0ID0ge307XHJcbiAgICAgICAgICAgIGN0cmwudGFibGVTdGF0ZSgpLnBhZ2luYXRpb24uc3RhcnQgPSAwO1xyXG4gICAgICAgICAgICBjdHJsLnBpcGUoKTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGN0cmwuc29ydEJ5KHByZWRpY2F0ZSwgaW5kZXggJSAyID09PSAwKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGVsZW1lbnQuYmluZCgnY2xpY2snLCBmdW5jdGlvbiBzb3J0Q2xpY2sgKCkge1xyXG4gICAgICAgICAgaWYgKHByZWRpY2F0ZSkge1xyXG4gICAgICAgICAgICBzY29wZS4kYXBwbHkoc29ydCk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmIChzb3J0RGVmYXVsdCkge1xyXG4gICAgICAgICAgaW5kZXggPSBzb3J0RGVmYXVsdCA9PT0gJ3JldmVyc2UnID8gMSA6IDA7XHJcbiAgICAgICAgICBzb3J0KCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5zb3J0O1xyXG4gICAgICAgIH0sIGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlLnByZWRpY2F0ZSAhPT0gcHJlZGljYXRlKSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gMDtcclxuICAgICAgICAgICAgZWxlbWVudFxyXG4gICAgICAgICAgICAgIC5yZW1vdmVDbGFzcyhjbGFzc0FzY2VudClcclxuICAgICAgICAgICAgICAucmVtb3ZlQ2xhc3MoY2xhc3NEZXNjZW50KTtcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGluZGV4ID0gbmV3VmFsdWUucmV2ZXJzZSA9PT0gdHJ1ZSA/IDIgOiAxO1xyXG4gICAgICAgICAgICBlbGVtZW50XHJcbiAgICAgICAgICAgICAgLnJlbW92ZUNsYXNzKHN0YXRlQ2xhc3Nlc1tpbmRleCAlIDJdKVxyXG4gICAgICAgICAgICAgIC5hZGRDbGFzcyhzdGF0ZUNsYXNzZXNbaW5kZXggLSAxXSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSwgdHJ1ZSk7XHJcbiAgICAgIH1cclxuICAgIH07XHJcbiAgfV0pO1xyXG4iLCJuZy5tb2R1bGUoJ3NtYXJ0LXRhYmxlJylcclxuICAuZGlyZWN0aXZlKCdzdFBhZ2luYXRpb24nLCBbJ3N0Q29uZmlnJywgZnVuY3Rpb24gKHN0Q29uZmlnKSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXN0cmljdDogJ0VBJyxcclxuICAgICAgcmVxdWlyZTogJ15zdFRhYmxlJyxcclxuICAgICAgc2NvcGU6IHtcclxuICAgICAgICBzdEl0ZW1zQnlQYWdlOiAnPT8nLFxyXG4gICAgICAgIHN0RGlzcGxheWVkUGFnZXM6ICc9PycsXHJcbiAgICAgICAgc3RQYWdlQ2hhbmdlOiAnJidcclxuICAgICAgfSxcclxuICAgICAgdGVtcGxhdGVVcmw6IGZ1bmN0aW9uIChlbGVtZW50LCBhdHRycykge1xyXG4gICAgICAgIGlmIChhdHRycy5zdFRlbXBsYXRlKSB7XHJcbiAgICAgICAgICByZXR1cm4gYXR0cnMuc3RUZW1wbGF0ZTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHN0Q29uZmlnLnBhZ2luYXRpb24udGVtcGxhdGU7XHJcbiAgICAgIH0sXHJcbiAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgc2NvcGUuc3RJdGVtc0J5UGFnZSA9IHNjb3BlLnN0SXRlbXNCeVBhZ2UgPyArKHNjb3BlLnN0SXRlbXNCeVBhZ2UpIDogc3RDb25maWcucGFnaW5hdGlvbi5pdGVtc0J5UGFnZTtcclxuICAgICAgICBzY29wZS5zdERpc3BsYXllZFBhZ2VzID0gc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyA/ICsoc2NvcGUuc3REaXNwbGF5ZWRQYWdlcykgOiBzdENvbmZpZy5wYWdpbmF0aW9uLmRpc3BsYXllZFBhZ2VzO1xyXG5cclxuICAgICAgICBzY29wZS5jdXJyZW50UGFnZSA9IDE7XHJcbiAgICAgICAgc2NvcGUucGFnZXMgPSBbXTtcclxuICAgICAgICBzY29wZS5lbGVtZW50cyA9IGN0cmwuZ2V0RWxlbWVudHMoKTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gcmVkcmF3ICgpIHtcclxuICAgICAgICAgIHZhciBwYWdpbmF0aW9uU3RhdGUgPSBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xyXG4gICAgICAgICAgdmFyIHN0YXJ0ID0gMTtcclxuICAgICAgICAgIHZhciBlbmQ7XHJcbiAgICAgICAgICB2YXIgaTtcclxuICAgICAgICAgIHZhciBwcmV2UGFnZSA9IHNjb3BlLmN1cnJlbnRQYWdlO1xyXG4gICAgICAgICAgc2NvcGUuY3VycmVudFBhZ2UgPSBNYXRoLmZsb29yKHBhZ2luYXRpb25TdGF0ZS5zdGFydCAvIHBhZ2luYXRpb25TdGF0ZS5udW1iZXIpICsgMTtcclxuXHJcbiAgICAgICAgICBzdGFydCA9IE1hdGgubWF4KHN0YXJ0LCBzY29wZS5jdXJyZW50UGFnZSAtIE1hdGguYWJzKE1hdGguZmxvb3Ioc2NvcGUuc3REaXNwbGF5ZWRQYWdlcyAvIDIpKSk7XHJcbiAgICAgICAgICBlbmQgPSBzdGFydCArIHNjb3BlLnN0RGlzcGxheWVkUGFnZXM7XHJcblxyXG4gICAgICAgICAgaWYgKGVuZCA+IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzKSB7XHJcbiAgICAgICAgICAgIGVuZCA9IHBhZ2luYXRpb25TdGF0ZS5udW1iZXJPZlBhZ2VzICsgMTtcclxuICAgICAgICAgICAgc3RhcnQgPSBNYXRoLm1heCgxLCBlbmQgLSBzY29wZS5zdERpc3BsYXllZFBhZ2VzKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBzY29wZS5wYWdlcyA9IFtdO1xyXG4gICAgICAgICAgc2NvcGUubnVtUGFnZXMgPSBwYWdpbmF0aW9uU3RhdGUubnVtYmVyT2ZQYWdlcztcclxuXHJcbiAgICAgICAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHNjb3BlLnBhZ2VzLnB1c2goaSk7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgaWYgKHByZXZQYWdlICE9PSBzY29wZS5jdXJyZW50UGFnZSkge1xyXG4gICAgICAgICAgICBzY29wZS5zdFBhZ2VDaGFuZ2Uoe25ld1BhZ2U6IHNjb3BlLmN1cnJlbnRQYWdlfSk7XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvL3RhYmxlIHN0YXRlIC0tPiB2aWV3XHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgIHJldHVybiBjdHJsLnRhYmxlU3RhdGUoKS5wYWdpbmF0aW9uO1xyXG4gICAgICAgIH0sIHJlZHJhdywgdHJ1ZSk7XHJcblxyXG4gICAgICAgIC8vc2NvcGUgLS0+IHRhYmxlIHN0YXRlICAoLS0+IHZpZXcpXHJcbiAgICAgICAgc2NvcGUuJHdhdGNoKCdzdEl0ZW1zQnlQYWdlJywgZnVuY3Rpb24gKG5ld1ZhbHVlLCBvbGRWYWx1ZSkge1xyXG4gICAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBvbGRWYWx1ZSkge1xyXG4gICAgICAgICAgICBzY29wZS5zZWxlY3RQYWdlKDEpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBzY29wZS4kd2F0Y2goJ3N0RGlzcGxheWVkUGFnZXMnLCByZWRyYXcpO1xyXG5cclxuICAgICAgICAvL3ZpZXcgLT4gdGFibGUgc3RhdGVcclxuICAgICAgICBzY29wZS5zZWxlY3RQYWdlID0gZnVuY3Rpb24gKHBhZ2UpIHtcclxuICAgICAgICAgIGlmIChwYWdlID4gMCAmJiBwYWdlIDw9IHNjb3BlLm51bVBhZ2VzKSB7XHJcbiAgICAgICAgICAgIGN0cmwuc2xpY2UoKHBhZ2UgLSAxKSAqIHNjb3BlLnN0SXRlbXNCeVBhZ2UsIHNjb3BlLnN0SXRlbXNCeVBhZ2UpO1xyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmICghY3RybC50YWJsZVN0YXRlKCkucGFnaW5hdGlvbi5udW1iZXIpIHtcclxuICAgICAgICAgIGN0cmwuc2xpY2UoMCwgc2NvcGUuc3RJdGVtc0J5UGFnZSk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH1dKTtcclxuIiwibmcubW9kdWxlKCdzbWFydC10YWJsZScpXHJcbiAgLmRpcmVjdGl2ZSgnc3RQaXBlJywgWydzdENvbmZpZycsICckdGltZW91dCcsIGZ1bmN0aW9uIChjb25maWcsICR0aW1lb3V0KSB7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICByZXF1aXJlOiAnc3RUYWJsZScsXHJcbiAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgc3RQaXBlOiAnPSdcclxuICAgICAgfSxcclxuICAgICAgbGluazoge1xyXG5cclxuICAgICAgICBwcmU6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuXHJcbiAgICAgICAgICB2YXIgcGlwZVByb21pc2UgPSBudWxsO1xyXG5cclxuICAgICAgICAgIGlmIChuZy5pc0Z1bmN0aW9uKHNjb3BlLnN0UGlwZSkpIHtcclxuICAgICAgICAgICAgY3RybC5wcmV2ZW50UGlwZU9uV2F0Y2goKTtcclxuICAgICAgICAgICAgY3RybC5waXBlID0gZnVuY3Rpb24gKCkge1xyXG5cclxuICAgICAgICAgICAgICBpZiAocGlwZVByb21pc2UgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICR0aW1lb3V0LmNhbmNlbChwaXBlUHJvbWlzZSlcclxuICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgIHBpcGVQcm9taXNlID0gJHRpbWVvdXQoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgc2NvcGUuc3RQaXBlKGN0cmwudGFibGVTdGF0ZSgpLCBjdHJsKTtcclxuICAgICAgICAgICAgICB9LCBjb25maWcucGlwZS5kZWxheSk7XHJcblxyXG4gICAgICAgICAgICAgIHJldHVybiBwaXBlUHJvbWlzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIHBvc3Q6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCwgYXR0cnMsIGN0cmwpIHtcclxuICAgICAgICAgIGN0cmwucGlwZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfTtcclxuICB9XSk7XHJcbiIsIm5nLm1vZHVsZSgnc21hcnQtdGFibGUnKVxyXG4gIC5kaXJlY3RpdmUoJ3N0UmVzZXRGaWx0ZXInLCBbJyRwYXJzZScsIGZ1bmN0aW9uICgkcGFyc2UpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICByZXN0cmljdDogJ0EnLFxyXG4gICAgICAgICAgICByZXF1aXJlOiAnXnN0VGFibGUnLFxyXG4gICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHIsIGN0cmwpIHtcclxuICAgICAgICAgICAgICAgIHZhciB0YWJsZUN0cmwgPSBjdHJsO1xyXG4gICAgICAgICAgICAgICAgdmFyIGZuID0gJHBhcnNlKGF0dHJbJ3N0UmVzZXRGaWx0ZXInXSk7XHJcblxyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5vbignY2xpY2snLCBmdW5jdGlvbiAoZXZlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjdHJsLnRhYmxlU3RhdGUoKS5zZWFyY2ggPSB7fTtcclxuICAgICAgICAgICAgICAgICAgICB0YWJsZUN0cmwuc2VhcmNoKCcnLCAnJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZm4oc2NvcGUsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICRldmVudDogZXZlbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuICB9XSk7IiwifSkoYW5ndWxhcik7Il0sInNvdXJjZVJvb3QiOiIvc291cmNlLyJ9